import ollama
from neo4j import GraphDatabase
from pathlib import Path
import csv
import json
from dotenv import load_dotenv
import os
import hashlib
from typing import List, Dict, Any, Optional

# Load environment variables
load_dotenv()

class EPSGraphBuilder:
    def __init__(self,
                 neo4j_uri=None,
                 neo4j_user=None,
                 neo4j_password=None,
                 embedding_model="mxbai-embed-large:latest",
                 ollama_model="granite4:micro-h"):

        # Use environment variables if not provided
        self.neo4j_uri = neo4j_uri or os.getenv("NEO4J_URI")
        self.neo4j_user = neo4j_user or os.getenv("NEO4J_USER")
        self.neo4j_password = neo4j_password or os.getenv("NEO4J_PASSWORD")

        self.driver = GraphDatabase.driver(
            self.neo4j_uri,
            auth=(self.neo4j_user, self.neo4j_password)
        )
        self.embedding_model = embedding_model
        self.ollama_model = ollama_model

    def generate_document_embedding(self, text: str) -> List[float]:
        """Generate embeddings for document content"""
        try:
            response = ollama.embeddings(
                model=self.embedding_model,
                prompt=text[:2000]  # Limit text length for embedding
            )
            return response['embedding']
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            return []

    def extract_document_entities(self, filename: str, content: str) -> Dict[str, Any]:
        """Use LLM to extract entities and concepts from document"""
        prompt = f"""Analyze this document and extract the following information:
        - Main topics discussed (2-4 key concepts)
        - Key entities mentioned (people, organizations, technologies, etc.)
        - Document type (report, testimony, article, etc.)
        - Content summary (1-2 sentences)

        Document: {filename}
        Content: {content[:1500]}...

        Return as JSON with keys: topics, entities, document_type, summary
        """

        try:
            response = ollama.generate(
                model=self.ollama_model,
                prompt=prompt,
                format='json'
            )

            entities = json.loads(response['response'])
            return entities

        except Exception as e:
            print(f"Error extracting entities with LLM: {e}")
            return {
                'topics': ['document'],
                'entities': [],
                'document_type': 'unknown',
                'summary': content[:200] + '...' if len(content) > 200 else content
            }

    def create_eps_node(self, filename: str, content: str):
        """Create EPS document node with embeddings and relationships"""

        if not content or not content.strip():
            return

        # Extract entities using LLM with error handling
        try:
            entities = self.extract_document_entities(filename, content)
        except Exception as e:
            print(f"⚠️ LLM entity extraction failed for {filename}: {e}. Using fallback data.")
            entities = {
                'topics': ['document'],
                'entities': [],
                'document_type': 'unknown',
                'summary': content[:200] + '...' if len(content) > 200 else content
            }

        # Generate content hash for deduplication
        content_hash = hashlib.md5(content.encode()).hexdigest()

        # Generate embedding for content with fallback
        try:
            content_embedding = self.generate_document_embedding(content)
        except Exception as e:
            print(f"⚠️ Embedding generation failed for {filename}: {e}. Using empty embeddings.")
            content_embedding = []

        with self.driver.session() as session:
            try:
                # Create the main EPS document node
                session.run("""
                    MERGE (d:EPSDocument {
                        filename: $filename,
                        content_hash: $content_hash,
                        document_type: $document_type,
                        summary: $summary,
                        content_embedding: $embedding
                    })
                    SET d.raw_content = $raw_content
                    """,
                    filename=filename,
                    content_hash=content_hash,
                    document_type=entities['document_type'],
                    summary=entities['summary'],
                    embedding=content_embedding,
                    raw_content=content[:10000]  # Limit content size
                )

                # Create topic relationships
                for topic in entities.get('topics', []):
                    session.run("""
                        MERGE (t:Topic {name: $topic_name})
                        WITH t
                        MATCH (d:EPSDocument {filename: $filename})
                        MERGE (d)-[:DISCUSSES]->(t)
                        """,
                        topic_name=topic.strip(),
                        filename=filename
                    )

                # Create entity relationships
                for entity in entities.get('entities', []):
                    session.run("""
                        MERGE (e:Entity {name: $entity_name, type: 'person'})
                        WITH e
                        MATCH (d:EPSDocument {filename: $filename})
                        MERGE (d)-[:MENTIONS]->(e)
                        """,
                        entity_name=entity.strip(),
                        filename=filename
                    )

                print(f"✓ Created EPS document node: {filename}")

            except Exception as e:
                print(f"Error creating EPS node for {filename}: {e}")

    def ingest_eps_csv(self, csv_path: Path):
        """Ingest EPS CSV data into Neo4j"""

        if not csv_path.exists():
            print(f"CSV file {csv_path} does not exist")
            return

        print(f"Ingesting EPS documents from {csv_path}...")

        # Use proper CSV reader that handles multi-line quoted fields
        documents_ingested = 0

        try:
            with open(csv_path, 'r', encoding='utf-8', newline='') as f:
                # Use csv.reader to properly handle quoted multi-line fields
                csv_reader = csv.reader(f)

                # Skip header row
                next(csv_reader, None)

                for row in csv_reader:
                    if len(row) >= 2:
                        filename = row[0].strip()
                        content = row[1].strip()

                        # Skip empty content
                        if not content:
                            continue

                        self.create_eps_node(filename, content)
                        documents_ingested += 1

                        if documents_ingested % 10 == 0:  # Reduced frequency for testing
                            print(f"Processed {documents_ingested} documents...")
                    else:
                        print(f"Skipping malformed row with {len(row)} columns: {row if len(row) else 'empty'}")

        except Exception as e:
            print(f"Error reading CSV: {e}")
            return

        print(f"✓ Ingested {documents_ingested} EPS documents")

    def create_similarity_relationships(self):
        """Create similarity relationships based on embeddings"""
        print("Creating document similarity relationships...")

        with self.driver.session() as session:
            try:
                # Create similarity relationships using KNN
                # Note: This is a simplified approach. In production, you might want to use
                # vector similarity functions for better accuracy

                result = session.run("""
                    MATCH (d1:EPSDocument), (d2:EPSDocument)
                    WHERE id(d1) > id(d2)  // Avoid duplicate pairs
                    WITH d1, d2,
                         reduce(dot = 0.0, i IN range(0, size(d1.content_embedding)-1) |
                           dot + d1.content_embedding[i] * d2.content_embedding[i]
                         ) AS dot_product,
                         sqrt(reduce(sum_sq = 0.0, i IN range(0, size(d1.content_embedding)-1) |
                           sum_sq + d1.content_embedding[i] * d1.content_embedding[i]
                         )) AS mag1,
                         sqrt(reduce(sum_sq = 0.0, i IN range(0, size(d2.content_embedding)-1) |
                           sum_sq + d2.content_embedding[i] * d2.content_embedding[i]
                         )) AS mag2
                    WITH d1, d2, dot_product / (mag1 * mag2) AS similarity
                    WHERE similarity > 0.7  // Only create relationships for highly similar documents
                    CREATE (d1)-[:SIMILAR_TO {similarity: similarity}]->(d2)
                    RETURN count(*) as relationships_created
                """)

                count = result.single()['relationships_created'] if result else 0
                print(f"Created {count} similarity relationships")

            except Exception as e:
                print(f"Error creating similarity relationships: {e}")

    def create_vector_indexes(self):
        """Create vector indexes for EPS documents"""
        with self.driver.session() as session:
            try:
                # EPS document content embeddings (1024 dimensions for mxbai-embed-large)
                session.run("""
                    CREATE VECTOR INDEX eps_document_embeddings IF NOT EXISTS
                    FOR (d:EPSDocument)
                    ON d.content_embedding
                    OPTIONS {
                        indexConfig: {
                            `vector.dimensions`: 1024,
                            `vector.similarity_function`: 'cosine'
                        }
                    }
                """)

                # Topic embeddings
                session.run("""
                    CREATE VECTOR INDEX topic_embeddings IF NOT EXISTS
                    FOR (t:Topic)
                    ON t.embedding
                    OPTIONS {
                        indexConfig: {
                            `vector.dimensions`: 1024,
                            `vector.similarity_function`: 'cosine'
                        }
                    }
                """)

                print("✓ Vector indexes created for EPS data")

            except Exception as e:
                print(f"Error creating vector indexes: {e}")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest EPS document data from CSV into Neo4j graph")
    parser.add_argument("--csv", type=str, default="EPS_FILES_20K_NOV2026.csv",
                       help="Path to EPS files CSV")
    parser.add_argument("--create-indexes", action="store_true",
                       help="Create vector indexes after ingestion")
    parser.add_argument("--create-similarities", action="store_true",
                       help="Create similarity relationships after ingestion")

    args = parser.parse_args()

    builder = EPSGraphBuilder()

    # Ingest EPS data
    csv_path = Path(args.csv)
    builder.ingest_eps_csv(csv_path)

    # Create similarity relationships if requested
    if args.create_similarities:
        builder.create_similarity_relationships()

    # Setup indexes if requested
    if args.create_indexes:
        builder.create_vector_indexes()
