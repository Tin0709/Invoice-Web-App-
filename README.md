# Motel Receipt / Invoice Web App

A responsive web application for managing rental rooms, tenants, monthly room invoices, payment status, and invoice history.

Live demo: https://invoice-web-app-nine.vercel.app/login  
Repository: https://github.com/Tin0709/Invoice-Web-App-

---

## Overview

This project is a rental room invoice management system built to help landlords manage room blocks, tenants, monthly receipts, unpaid balances, and invoice history in a simple and mobile-friendly way.

The application supports user authentication, room/block management, invoice creation, invoice draft saving, monthly history tracking, and PDF/print output. It is designed for real use, especially for users who need a simple interface to manage rental payments each month.

---

## Main Features

### Authentication

- User login and registration
- Google login through Supabase Auth
- User-specific data isolation, so each account only sees its own rooms and invoices

### Room and Block Management

- Create room blocks, such as Block A, Block B, etc.
- Add new rooms with tenant name and default rent
- Rename rooms
- Delete rooms with confirmation modal
- Sort rooms by name
- Mobile-friendly room cards

### Invoice Management

- Create monthly rental invoices for each room
- Edit room name, tenant name, invoice month, year, and collection date
- Input rental fee, trash fee, electricity usage, water usage, previous debt, and paid amount
- Automatically calculate:
  - Electricity usage
  - Water usage
  - Electricity cost
  - Water cost
  - Current month total
  - Previous unpaid amount
  - Total amount
  - Paid amount
  - Remaining debt

### Draft Invoice Saving

- Automatically saves unsaved invoice changes as drafts
- Restores draft data when returning to an invoice
- Shows warning/toast notification when an invoice has unsaved changes
- Supports draft sync using Supabase

### Invoice History

- View saved invoices grouped by month
- Search and filter invoice history
- Display monthly revenue summary
- Show paid and unpaid invoice status
- Delete saved invoice history when needed

### Print and PDF Support

- Print invoices directly from the browser
- Optimized print layout for A4 PDF
- Invoice PDF title format supports room and tenant name

### Responsive UI

- Optimized for both desktop and mobile
- Designed with a simple and clean interface
- Large buttons and readable layout for easier use on phones

---

## Tech Stack

### Frontend

- React
- Vite
- React Router
- CSS

### Backend / Database

- Supabase
- Supabase Auth
- Supabase PostgreSQL database

### Deployment

- Vercel
- GitHub

---

## Project Structure

```txt
motel-receipt/
├── public/
│   └── logo.png
├── src/
│   ├── components/
│   │   ├── AccountMenu.jsx
│   │   ├── Invoice.jsx
│   │   └── LoadingCard.jsx
│   ├── pages/
│   │   ├── HomePage.jsx
│   │   ├── InvoicePage.jsx
│   │   ├── HistoryPage.jsx
│   │   └── LoginPage.jsx
│   ├── styles/
│   │   ├── home.css
│   │   ├── invoice.css
│   │   ├── history.css
│   │   ├── login.css
│   │   └── loading.css
│   ├── utils/
│   │   ├── auth.js
│   │   ├── storage.js
│   │   ├── supabase.js
│   │   └── supabaseStorage.js
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── package.json
├── vercel.json
└── README.md
