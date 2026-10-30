import type { NextFunction, Request, Response } from 'express'
import { CONFIG } from '../config.js'

// Minimal CORS: only origins listed in CORS_ORIGINS can call the API from a browser
export function cors ({ allowedOrigins = CONFIG.CORS_ORIGINS as readonly string[] } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.header('origin')

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }

    next()
  }
}
