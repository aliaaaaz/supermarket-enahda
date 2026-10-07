# Architecture Overview

## Purpose
SuperMarket eNahda is a real ecommerce MVP for a local supermarket in Agadir. The project is designed to help the business sell online while learning modern frontend and backend architecture with real-world constraints.

## Current stack
- Frontend: React + Vite + JavaScript
- Styling: CSS modules / custom CSS
- Environment: Windows development machine
- Target deployment: modern hosting solution after MVP stability

## Core UX flow
1. Customer lands on the homepage.
2. Customer browses categories and featured products.
3. Customer searches or filters by category.
4. Customer opens a product page and adds items to cart.
5. Customer checks out and places an order.
6. Admin manages products, inventory, and orders.

## Functional goals
- Product catalog
- Category browsing
- Search and filtering
- Cart and checkout
- User accounts
- Admin dashboard
- Inventory tracking
- Order tracking
- Discounts and promotions

## Architecture principles
- Simple first, scalable later.
- Mobile-first interface design.
- Security-first implementation.
- Clean separation of data, UI, and logic.
- Real product focus rather than tutorial-only development.

## Future backend direction
The frontend will later connect to secure backend services with:
- authentication and authorization
- database models for products, users, orders, inventory
- API endpoints with validation and limits
- audit logging and role-based access
