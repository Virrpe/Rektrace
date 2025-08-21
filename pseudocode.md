# Qdrant Embeddings Pseudocode

## index_docs.py

```python
# Main indexing flow
def main():
    config = load_config()
    qdrant_client = connect_qdrant(config.qdrant_url)
    embedding_model = load_sentence_transformer()
    
    collection_name = "rektrace_docs"
    ensure_collection_exists(qdrant_client, collection_name)
    
    if config.recreate:
        recreate_collection(qdrant_client, collection_name)
    
    files = discover_files(config.repo_path)
    batches = chunk_files(files, batch_size=100)
    
    for batch in batches:
        vectors = process_batch(batch, embedding_model)
        upload_to_qdrant(qdrant_client, collection_name, vectors)
    
    print(f"Indexed {len(files)} files")

# File discovery
def discover_files(repo_path):
    extensions = ['.py', '.js', '.ts', '.md', '.txt']
    files = []
    for root, dirs, filenames in os.walk(repo_path):
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        for filename in filenames:
            if any(filename.endswith(ext) for ext in extensions):
                filepath = os.path.join(root, filename)
                if os.path.getsize(filepath) < 1024 * 1024:  # 1MB limit
                    files.append(filepath)
    return files

# Content processing
def process_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        metadata = {
            'filepath': filepath,
            'filename': os.path.basename(filepath),
            'extension': os.path.splitext(filepath)[1],
            'size': len(content),
            'indexed_at': datetime.utcnow().isoformat()
        }
        
        return {
            'content': content,
            'metadata': metadata
        }
    except Exception as e:
        log_error(f"Error processing {filepath}: {e}")
        return None

# Vector generation
def generate_embeddings(texts, model):
    vectors = model.encode(texts, show_progress_bar=True)
    return vectors.tolist()

# Qdrant operations
def upload_to_qdrant(client, collection, vectors_with_metadata):
    points = []
    for idx, (vector, metadata) in enumerate(vectors_with_metadata):
        point = PointStruct(
            id=hash(metadata['filepath']) + idx,
            vector=vector,
            payload=metadata
        )
        points.append(point)
    
    client.upsert(collection_name=collection, points=points)
```

## Makefile Targets

```makefile
# Qdrant service management
qdrant:
	docker-compose up -d qdrant

index:
	python scripts/index_docs.py

index-recreate:
	python scripts/index_docs.py --recreate
```

## Grafana Dashboard JSON Structure

```json
{
  "dashboard": {
    "title": "Rektrace Overview",
    "panels": [
      {
        "type": "stat",
        "title": "Redis Exporter Status",
        "targets": [{"expr": "up{job=\"redis_exporter\"}"}]
      },
      {
        "type": "timeseries",
        "title": "Request Rate",
        "targets": [{"expr": "rektrace_requests_total"}]
      }
    ]
  }
}