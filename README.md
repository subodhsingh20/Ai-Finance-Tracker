# Ledger — AI Finance Tracker

Ledger is a private, invite-only app for tracking personal finances in Indian rupees (INR). Use it to record transactions, manage budgets and savings goals, and keep track of income, assets, and liabilities. An AI assistant can turn written notes into transaction suggestions for you to review before saving.

> **Project status:** Ledger is under active development and is not ready to be relied on as the only record of your finances. It has not been fully checked in a hosted environment.

## What you can do

- Track income, expenses, savings, and investments.
- Review dashboards and summaries based on your records.
- Organize older or removed records in Archive & Trash, and restore them when needed.
- Enter several transactions at once with AI suggestions. Check the preview and confirm before anything is saved.
- Export filtered transaction data as CSV or JSON.

## Built with

- React, TypeScript, and Vite
- Supabase Auth and Postgres for accounts and data
- Cloudflare Workers and Workers AI for AI-assisted entry

## Run locally

### Requirements

- Node.js 22 and npm
- Docker Desktop with its Linux engine, for local Supabase
- Supabase CLI (the commands below use version 2.122.0)

### Setup

1. Create `.env.local` with your Supabase project URL and publishable key:

   ```env
   VITE_SUPABASE_URL=your-supabase-project-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
