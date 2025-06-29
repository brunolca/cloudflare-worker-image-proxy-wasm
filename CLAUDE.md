# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `pnpm run dev` - Start development server with live reload
- `pnpm run deploy` - Deploy to Cloudflare Workers
- `pnpm run start` - Alias for dev command
- `pnpm run cf-typegen` - Generate TypeScript types from Wrangler configuration

## Architecture Overview

This is a Cloudflare Worker that provides an image proxy service with WebAssembly-based image processing. The main components are:

### Core Worker (src/index.ts)
- Single-file architecture handling all image processing logic
- Uses @cf-wasm/photon for WebAssembly-based image transformations
- Implements URL-based operation parsing (e.g., `/w_400,f_webp/source-url`)
- Includes domain validation, caching, and CORS handling

### Configuration
- Environment variables defined in `wrangler.jsonc` under `vars`
- `ALLOWED_DOMAINS`: Array of allowed source domains (supports wildcards)
- `MAX_WIDTH`/`MAX_HEIGHT`: Maximum image dimensions
- Generated type definitions in `worker-configuration.d.ts`

### Image Processing Pipeline
1. URL parsing and validation (`/{operations}/{source_url}` format)
2. Domain whitelist validation using `validateDomain()`
3. Operation parsing with Zod schemas (`parseImageProxyOptions()`)
4. Source image fetching with headers forwarding
5. WebAssembly processing using PhotonImage
6. Response generation with proper content types and caching headers

### Key Features
- WebAssembly image processing with Photon
- Cloudflare Cache API integration
- Domain security validation
- Multiple output formats (WebP, JPEG, PNG)
- Aspect ratio preservation
- Quality control for lossy formats

## Security Considerations

- Always configure `ALLOWED_DOMAINS` in production to prevent SSRF attacks
- Domain validation supports exact matches and wildcard patterns
- All image processing is done in-memory with WebAssembly
- Input validation using Zod schemas with size limits

## Development Notes

- Uses pnpm for package management
- TypeScript with strict mode enabled
- Cloudflare Workers runtime with nodejs_compat flag
- No tests currently configured
- Single main entry point at src/index.ts