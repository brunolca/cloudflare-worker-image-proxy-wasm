# Cloudflare Worker Image Proxy

A blazing-fast image proxy service running on Cloudflare Workers with WebAssembly processing.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/brunolca/cloudflare-worker-image-proxy-wasm)

## Features

- **WebAssembly Processing**:image transformations using @cf-wasm/photon
- **Global Edge Caching**: Cloudflare Cache API for fast response times
- **Multiple Formats**: WebP, JPEG, PNG output with smart format detection
- **Flexible Resizing**: Width, height, exact dimensions with multiple fit modes
- **Quality Control**: Configurable compression for optimal file sizes
- **Zero Cold Start**: Optimized for instant response times

## Quick Start

1. **Clone and install:**

   ```bash
   git clone https://github.com/brunolca/cloudflare-worker-image-proxy-wasm.git
   cd cloudflare-worker-image-proxy-wasm
   pnpm install
   ```

2. **Configure vars in `wrangler.jsonc`:**

   ```jsonc
   {
     "vars": {
       "ALLOWED_DOMAINS": ["images.unsplash.com", "picsum.photos"],
       "MAX_WIDTH": "4000",
       "MAX_HEIGHT": "4000"
     }
   }
   ```

3. **Deploy to Cloudflare Workers:**

   ```bash
   pnpm run deploy
   ```

4. **Test your deployment:**
   ```bash
   curl "https://your-worker.workers.dev/w_400,f_webp/https://picsum.photos/800/600"
   ```

## URL Format & Operations

### Basic Syntax

```
https://your-worker.workers.dev/{operations}/{source_url}
```

### Available Operations

| Operation  | Description                                   | Example  |
| ---------- | --------------------------------------------- | -------- |
| `w_N`      | Set width (maintain aspect ratio)             | `w_400`  |
| `h_N`      | Set height (maintain aspect ratio)            | `h_300`  |
| `f_FORMAT` | Output format (`webp`, `jpeg`, `png`, `auto`) | `f_webp` |
| `q_N`      | Quality 1-100 (JPEG/WebP only)                | `q_85`   |
| `_`        | Return original image (bypass processing)     | `_`      |

### Combining Operations

Chain multiple operations with commas:

```
https://your-worker.workers.dev/w_400,f_webp,q_90/https://example.com/image.jpg
```

## Usage Examples

```bash
# Original image (bypass processing)
curl "https://your-worker.workers.dev/_/https://picsum.photos/800/600"

# Resize width to 400px (maintain aspect ratio)
curl "https://your-worker.workers.dev/w_400/https://picsum.photos/800/600"

# Convert to WebP format
curl "https://your-worker.workers.dev/f_webp/https://picsum.photos/800/600"

# Exact dimensions (200×200px)
curl "https://your-worker.workers.dev/s_200x200/https://picsum.photos/800/600"
```

## Configuration

### Environment Variables

Configure security and performance settings in `wrangler.jsonc`:

```jsonc
{
  "vars": {
    "HTTP_STORAGE_DOMAINS": "domain1.com,domain2.com,*.cdn.example.com",
    "MAX_WIDTH": "4000",
    "MAX_HEIGHT": "4000"
  }
}
```

| Variable          | Description            | Default | Example                 |
| ----------------- | ---------------------- | ------- | ----------------------- |
| `ALLOWED_DOMAINS` | Allowed source domains | `""`    | `example.com,*.cdn.com` |
| `MAX_WIDTH`       | Maximum image width    | `4000`  | `2000`                  |
| `MAX_HEIGHT`      | Maximum image height   | `4000`  | `2000`                  |

### Domain Security

The `ALLOWED_DOMAINS` variable supports flexible patterns:

```bash
# Exact domain matching
ALLOWED_DOMAINS="example.com,cdn.mysite.com"

# Wildcard subdomain matching
ALLOWED_DOMAINS="*.example.com,images.*.mycdn.com"

# Mixed patterns
ALLOWED_DOMAINS="exact-domain.com,*.wildcard-domain.com,another.com"
```

> **Security Note**: Always configure domain whitelist in production to prevent unauthorized usage and potential SSRF attacks.

## Development

```bash
# Start development server
pnpm run dev

# Type checking
pnpm run typecheck

# Build
pnpm run build

# Deploy
pnpm run deploy
```
