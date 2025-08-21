# Exact File Changes Plan

## New Files to Create

### 1. requirements-index.txt
**File**: `requirements-index.txt`
**Content**:
```
sentence-transformers>=2.2.2
qdrant-client>=1.6.0
python-dotenv>=1.0.0
tqdm>=4.65.0
```

### 2. scripts/index_docs.py
**File**: `scripts/index_docs.py`
**Lines**: 1-300
**Content**:
```python
#!/usr/bin/env python3
"""
Index repository files into Qdrant using local embeddings.
"""
import os
import sys
import hashlib
from pathlib import Path
from typing import List, Dict, Any
import argparse
from datetime import datetime

from sentence_transformers import SentenceTransformer
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from dotenv import load_dotenv
import tqdm

load_dotenv()

# Configuration
QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
COLLECTION_NAME = os.getenv("QDRANT_COLLECTION", "rektrace_docs")
REPO_PATH = os.getenv("REPO_PATH", ".")
VECTOR_SIZE = 384  # all-MiniLM-L6-v2
BATCH_SIZE = 100
MAX_FILE_SIZE = 1024 * 1024  # 1MB

# File extensions to index
ALLOWED_EXTENSIONS = {'.py', '.js', '.ts', '.md', '.txt', '.json', '.yaml', '.yml'}

class DocumentIndexer:
    def __init__(self, recreate: bool = False):
        self.client = QdrantClient(QDRANT_URL)
        self.model = SentenceTransformer('all-MiniLM-L6-v2')
        self.recreate = recreate
        
    def ensure_collection(self):
        """Create collection if it doesn't exist."""
        try:
            self.client.get_collection(COLLECTION_NAME)
            if self.recreate:
                print(f"Recreating collection {COLLECTION_NAME}")
                self.client.delete_collection(COLLECTION_NAME)
                self._create_collection()
        except Exception:
            print(f"Creating collection {COLLECTION_NAME}")
            self._create_collection()
    
    def _create_collection(self):
        """Create Qdrant collection with proper schema."""
        self.client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(
                size=VECTOR_SIZE,
                distance=Distance.COSINE
            )
        )
    
    def discover_files(self) -> List[Path]:
        """Discover files to index."""
        files = []
        repo_path = Path(REPO_PATH)
        
        for root, dirs, filenames in os.walk(repo_path):
            # Skip hidden directories
            dirs[:] = [d for d in dirs if not d.startswith('.')]
            
            for filename in filenames:
                filepath = Path(root) / filename
                
                if filepath.suffix.lower() in ALLOWED_EXTENSIONS:
                    if filepath.stat().st_size < MAX_FILE_SIZE:
                        files.append(filepath)
        
        return files
    
    def process_file(self, filepath: Path) -> Dict[str, Any]:
        """Process a single file."""
        try:
            content = filepath.read_text(encoding='utf-8')
            
            return {
                'content': content,
                'metadata': {
                    'filepath': str(filepath),
                    'filename': filepath.name,
                    'extension': filepath.suffix,
                    'size': len(content),
                    'indexed_at': datetime.utcnow().isoformat()
                }
            }
        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            return None
    
    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for texts."""
        embeddings = self.model.encode(texts, show_progress_bar=True)
        return embeddings.tolist()
    
    def index_files(self):
        """Main indexing function."""
        self.ensure_collection()
        
        files = self.discover_files()
        print(f"Found {len(files)} files to index")
        
        # Process in batches
        for i in range(0, len(files), BATCH_SIZE):
            batch_files = files[i:i+BATCH_SIZE]
            self._process_batch(batch_files)
    
    def _process_batch(self, batch_files: List[Path]):
        """Process a batch of files."""
        texts = []
        metadatas = []
        
        for filepath in batch_files:
            result = self.process_file(filepath)
            if result:
                texts.append(result['content'])
                metadatas.append(result['metadata'])
        
        if texts:
            embeddings = self.generate_embeddings(texts)
            
            points = []
            for idx, (embedding, metadata) in enumerate(zip(embeddings, metadatas)):
                point_id = hashlib.md5(
                    f"{metadata['filepath']}_{idx}".encode()
                ).hexdigest()
                
                points.append(PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=metadata
                ))
            
            self.client.upsert(
                collection_name=COLLECTION_NAME,
                points=points
            )
            
            print(f"Indexed batch of {len(points)} documents")

def main():
    parser = argparse.ArgumentParser(description="Index repository files into Qdrant")
    parser.add_argument("--recreate", action="store_true", help="Recreate collection")
    args = parser.parse_args()
    
    indexer = DocumentIndexer(recreate=args.recreate)
    indexer.index_files()
    
    print("Indexing complete!")

if __name__ == "__main__":
    main()
```

### 3. Makefile additions
**File**: `Makefile`
**Lines**: Add after line 179
```makefile
# Qdrant and indexing targets
qdrant: ## Start Qdrant service
	@echo "$(GREEN)Starting Qdrant...$(NC)"
	@docker-compose up -d qdrant

index: ## Index repository files into Qdrant
	@echo "$(GREEN)Indexing repository files...$(NC)"
	@python scripts/index_docs.py

index-recreate: ## Recreate Qdrant index
	@echo "$(GREEN)Recreating Qdrant index...$(NC)"
	@python scripts/index_docs.py --recreate
```

### 4. .env.example additions
**File**: `.env.example`
**Lines**: Add at end
```
# Qdrant Configuration
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=rektrace_docs
REPO_PATH=.
```

## Modified Files

### 5. docker-compose.yml patch
**File**: `docker-compose.yml`
**Lines**: Add after line 79
```yaml
  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
```

### 6. Volume addition
**File**: `docker-compose.yml`
**Lines**: Add after line 99
```yaml
  qdrant_data:
```

### 7. Grafana dashboard move and fix
**File**: Move `observability/grafana/dashboards/rektrace_overview.json` to `observability/grafana/dashboards/rektrace/rektrace_overview.json`

### 8. Dashboard provisioning path fix
**File**: `observability/grafana/provisioning/dashboards/dashboard.yml`
**Lines**: Change line 12
```yaml
      path: /var/lib/grafana/dashboards
```

### 9. Grafana dashboard JSON update
**File**: `observability/grafana/dashboards/rektrace/rektrace_overview.json`
**Content**: Replace existing panels with:
```json
{
  "panels": [
    {
      "datasource": {
        "type": "prometheus",
        "uid": "PBFA97CFB590B2093"
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "steps": [
              {
                "color": "red",
                "value": null
              },
              {
                "color": "green",
                "value": 1
              }
            ]
          }
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 1,
      "targets": [
        {
          "expr": "up{job=\"redis_exporter\"}",
          "refId": "A"
        }
      ],
      "title": "Redis Exporter Status",
      "type": "stat"
    },
    {
      "datasource": {
        "type": "prometheus",
        "uid": "PBFA97CFB590B2093"
      },
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          }
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 0
      },
      "id": 2,
      "targets": [
        {
          "expr": "rektrace_requests_total",
          "refId": "A"
        }
      ],
      "title": "Request Rate",
      "type": "timeseries"
    }
  ]
}