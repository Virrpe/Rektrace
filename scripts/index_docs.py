#!/usr/bin/env python3
"""
Index documentation into Qdrant vector database using local embeddings.
Processes markdown files and creates searchable vector embeddings.
"""

import os
import sys
from pathlib import Path
from typing import List, Dict, Any
import hashlib
import json
from datetime import datetime
import time

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue
)
from sentence_transformers import SentenceTransformer
from langchain.text_splitter import RecursiveCharacterTextSplitter
from dotenv import load_dotenv
import tqdm
from prometheus_client import CollectorRegistry, Gauge, Counter, Histogram, push_to_gateway

# Load environment variables
load_dotenv()

# Configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION", "rektrace_docs")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
INDEX_BATCH_SIZE = int(os.getenv("INDEX_BATCH_SIZE", "100"))
PUSHGATEWAY_URL = os.getenv("PUSHGATEWAY_URL", "http://localhost:9091")

# Initialize clients
qdrant_client = QdrantClient(url=QDRANT_URL)
embedding_model = SentenceTransformer(EMBEDDING_MODEL)

# Prometheus metrics
registry = CollectorRegistry()
docs_processed = Counter(
    'rektrace_docs_processed_total',
    'Total number of documents processed',
    ['status', 'source'],
    registry=registry
)
docs_indexed = Counter(
    'rektrace_docs_indexed_total',
    'Total number of document chunks indexed',
    registry=registry
)
indexing_duration = Histogram(
    'rektrace_indexing_duration_seconds',
    'Time spent indexing documents',
    registry=registry
)
docs_per_batch = Histogram(
    'rektrace_docs_per_batch',
    'Number of documents per batch',
    registry=registry
)
active_indexing = Gauge(
    'rektrace_active_indexing',
    'Active indexing operations',
    registry=registry
)

# Text processing
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", " ", ""]
)

def get_document_hash(content: str) -> str:
    """Generate hash for document deduplication."""
    return hashlib.md5(content.encode()).hexdigest()

def create_collection_if_not_exists():
    """Create Qdrant collection if it doesn't exist."""
    try:
        collections = qdrant_client.get_collections()
        collection_names = [col.name for col in collections.collections]
        
        if QDRANT_COLLECTION not in collection_names:
            qdrant_client.create_collection(
                collection_name=QDRANT_COLLECTION,
                vectors_config=VectorParams(
                    size=embedding_model.get_sentence_embedding_dimension(),
                    distance=Distance.COSINE
                )
            )
            print(f"Created collection: {QDRANT_COLLECTION}")
    except Exception as e:
        print(f"Error creating collection: {e}")
        sys.exit(1)

def extract_markdown_files(root_path: Path) -> List[Path]:
    """Find all markdown files recursively."""
    return list(root_path.rglob("*.md"))

def process_document(file_path: Path) -> List[Dict[str, Any]]:
    """Process a single markdown file into chunks."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Split into chunks
        chunks = text_splitter.split_text(content)
        
        # Create metadata
        relative_path = str(file_path.relative_to(Path.cwd()))
        
        documents = []
        for i, chunk in enumerate(chunks):
            doc_hash = get_document_hash(chunk)
            documents.append({
                "content": chunk,
                "metadata": {
                    "source": relative_path,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "hash": doc_hash,
                    "indexed_at": datetime.utcnow().isoformat()
                }
            })
        
        docs_processed.labels(status='success', source='markdown').inc()
        return documents
    except Exception as e:
        docs_processed.labels(status='error', source='markdown').inc()
        print(f"Error processing {file_path}: {e}")
        return []

def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a list of texts."""
    return embedding_model.encode(texts, show_progress_bar=False).tolist()

def push_metrics():
    """Push metrics to Prometheus Pushgateway."""
    try:
        push_to_gateway(PUSHGATEWAY_URL, job='rektrace_index_docs', registry=registry)
    except Exception as e:
        print(f"Warning: Failed to push metrics to Pushgateway: {e}")

def index_documents(documents: List[Dict[str, Any]], recreate: bool = False):
    """Index documents into Qdrant."""
    active_indexing.set(1)
    start_time = time.time()
    
    try:
        if recreate:
            try:
                qdrant_client.delete_collection(QDRANT_COLLECTION)
                create_collection_if_not_exists()
                print("Recreated collection")
            except Exception as e:
                print(f"Error recreating collection: {e}")
        
        if not documents:
            print("No documents to index")
            return
        
        # Prepare points for batch upload
        points = []
        for doc in documents:
            embedding = generate_embeddings([doc["content"]])[0]
            point_id = hashlib.md5(
                f"{doc['metadata']['source']}_{doc['metadata']['chunk_index']}".encode()
            ).hexdigest()
            
            points.append(PointStruct(
                id=point_id,
                vector=embedding,
                payload={
                    "content": doc["content"],
                    **doc["metadata"]
                }
            ))
        
        # Upload in batches
        batch_size = INDEX_BATCH_SIZE
        total_batches = len(points) // batch_size + (1 if len(points) % batch_size else 0)
        
        for i in tqdm.tqdm(range(0, len(points), batch_size),
                          desc="Indexing documents", total=total_batches):
            batch = points[i:i + batch_size]
            qdrant_client.upsert(
                collection_name=QDRANT_COLLECTION,
                points=batch
            )
            docs_per_batch.observe(len(batch))
        
        docs_indexed.inc(len(points))
        print(f"Indexed {len(points)} document chunks")
        
    finally:
        duration = time.time() - start_time
        indexing_duration.observe(duration)
        active_indexing.set(0)
        push_metrics()

def search_documents(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Search documents by semantic similarity."""
    query_embedding = generate_embeddings([query])[0]
    
    results = qdrant_client.search(
        collection_name=QDRANT_COLLECTION,
        query_vector=query_embedding,
        limit=limit
    )
    
    return [
        {
            "content": hit.payload["content"],
            "metadata": hit.payload,
            "score": hit.score
        }
        for hit in results
    ]

def main():
    """Main indexing function."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Index documentation into Qdrant")
    parser.add_argument("--recreate", action="store_true", 
                       help="Recreate collection before indexing")
    parser.add_argument("--search", type=str, help="Search query")
    parser.add_argument("--docs-path", type=str, default=".",
                       help="Path to documentation root")
    
    args = parser.parse_args()
    
    if args.search:
        results = search_documents(args.search)
        for i, result in enumerate(results, 1):
            print(f"\n--- Result {i} (score: {result['score']:.3f}) ---")
            print(f"Source: {result['metadata']['source']}")
            print(f"Content: {result['content'][:200]}...")
        return
    
    # Setup collection
    create_collection_if_not_exists()
    
    # Find and process documents
    docs_path = Path(args.docs_path)
    markdown_files = extract_markdown_files(docs_path)
    
    print(f"Found {len(markdown_files)} markdown files")
    
    all_documents = []
    for file_path in tqdm.tqdm(markdown_files, desc="Processing files"):
        documents = process_document(file_path)
        all_documents.extend(documents)
    
    print(f"Processed {len(all_documents)} document chunks")
    
    # Index documents
    index_documents(all_documents, recreate=args.recreate)
    
    print("Indexing complete!")

if __name__ == "__main__":
    main()