# Spotify Playlist Comments Extension

## Overview

A fully functional Chrome browser extension that adds a commenting system to Spotify's web player. The extension allows users to view and post comments on playlists and individual tracks through an overlay interface that appears on the Spotify web app. It consists of a Chrome extension frontend that injects UI components into Spotify's interface and a Node.js/Express backend that handles comment storage and retrieval.

## Current Status

**🔧 HTTPS MIGRATION IN PROGRESS** - The extension is fully built but requires external deployment:
- Backend server running on port 5000 with PostgreSQL database
- Chrome extension with content scripts, background service worker, and popup
- Real-time commenting system for playlists and tracks
- Shadow DOM UI integration with Spotify's interface
- Rate limiting and security measures implemented
- Database schema created and tested
- **FIXED**: Updated all API calls to use HTTPS instead of HTTP to resolve ERR_BLOCKED_BY_CLIENT errors
- **NEXT**: Need to deploy backend to external HTTPS URL for production use

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Chrome Extension (Manifest V3)**: Uses content scripts to inject UI into Spotify's web player
- **Shadow DOM Isolation**: Prevents CSS conflicts with Spotify's existing styles by encapsulating extension UI in shadow DOM
- **Component-Based Architecture**: Modular components including CommentPanel, CommentButton, and CommentBubble for different UI elements
- **Event-Driven Communication**: Uses Chrome's messaging API for communication between content scripts and background service worker
- **URL Monitoring**: Implements MutationObserver and route detection to track navigation within Spotify's single-page application

### Backend Architecture
- **Express.js REST API**: Handles HTTP requests for comment operations (GET, POST)
- **Database Layer**: Uses Drizzle ORM for database operations with PostgreSQL as the underlying database
- **Security Middleware**: Implements Helmet for security headers, CORS for cross-origin requests, and rate limiting for API protection
- **Error Handling**: Centralized error handling with retry logic and timeout management

### Data Storage
- **PostgreSQL Database**: Stores comments with schema including playlist_id, track_uri, comment text, and timestamps
- **Connection Pooling**: Uses pg Pool for efficient database connection management
- **Environment-Based Configuration**: Supports both development and production database configurations

### Authentication and Authorization
- **No Authentication (MVP)**: Current implementation allows anonymous commenting without user accounts
- **Shared Comment Threads**: All extension users see the same comments for each playlist/track

## External Dependencies

### Core Technologies
- **Chrome Extensions API**: For browser extension functionality and web page interaction
- **Express.js (v5.1.0)**: Web framework for the backend API server
- **Drizzle ORM (v0.44.4)**: Database ORM for PostgreSQL interactions
- **PostgreSQL**: Primary database for comment storage

### Development Dependencies
- **CORS (v2.8.5)**: Enables cross-origin requests between Spotify domain and backend
- **Express Rate Limit**: Protects API endpoints from abuse with configurable rate limiting
- **Helmet**: Provides security middleware for Express applications

### Browser APIs
- **Chrome Runtime API**: For extension lifecycle and message passing
- **Chrome Tabs API**: For detecting navigation to Spotify pages
- **Shadow DOM API**: For UI isolation within Spotify's interface
- **MutationObserver API**: For detecting changes in Spotify's dynamic content

### Spotify Integration
- **Spotify Web Player**: Extension specifically targets https://open.spotify.com/* URLs
- **DOM Manipulation**: Injects comment UI elements into Spotify's existing interface
- **URL Pattern Matching**: Extracts playlist and track IDs from Spotify's URL structure