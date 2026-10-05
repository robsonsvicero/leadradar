import { serveAI } from '../_shared/ai-core.ts'

Deno.serve(serveAI('generate-reply-assistant'))
