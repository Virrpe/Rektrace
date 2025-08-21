# Qdrant Embeddings & Grafana Dashboard Specification

## Overview
Add local embeddings indexing with Qdrant vector database and fix Grafana dashboard configuration.

## Part A: Qdrant Local Embeddings Indexing

### Requirements
- **docker-compose.yml**: Add Qdrant service with persistent storage
- **requirements-index.txt**: Python dependencies for embeddings
- **scripts/index_docs.py**: Index repository files into Qdrant (≤300 lines)
- **Makefile**: Add targets for Qdrant operations
- **.env.example**: Configuration keys for embeddings

### Functional Flow
1. **File Discovery**: Scan repository for relevant files (`.py`, `.js`, `.ts`, `.md`)
2. **Content Processing**: Extract text content with metadata
3. **Embedding Generation**: Use sentence-transformers for vector embeddings
4. **Qdrant Storage**: Store vectors with metadata in local Qdrant
5. **Index Management**: Support recreate and update operations

### Configuration
- **Qdrant Host**: `localhost:6333`
- **Collection**: `rektrace_docs`
- **Vector Size**: 384 (all-MiniLM-L6-v2)
- **Distance Metric**: Cosine similarity
- **Batch Size**: 100 documents

### Edge Cases
- Skip binary files and large files (>1MB)
- Handle encoding errors gracefully
- Skip hidden directories (`.git`, `node_modules`)
- Resume interrupted indexing

## Part B: Grafana Dashboard Fix

### Requirements
- **Dashboard Location**: `observability/grafana/dashboards/rektrace/rektrace_overview.json`
- **Provisioning Path**: Update to `/var/lib/grafana/dashboards`
- **Panels**: 
  1. Stat panel: `up{job="redis_exporter"}`
  2. Timeseries: `rektrace_requests_total`
- **Datasource UID**: `PBFA97CFB590B2093` or default

### Dashboard Configuration
- **Refresh**: 5s
- **Time Range**: 1h default
- **Tags**: `["rektrace"]`
- **Editable**: true

### Validation
- Prometheus datasource connectivity
- Panel queries return data
- Dashboard loads without errors