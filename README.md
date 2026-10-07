# Maison Verdant

A complete luxury e-commerce front end: 30 storefront pages, 18 admin pages, a living styleguide, and zero dependencies. Pure HTML5, CSS (cascade layers, BEM, container queries, `:has()`, oklch/color-mix, view transitions, scroll-driven animations) and vanilla ES2024 modules.

## Run it

The JavaScript is written as native ES modules, and browsers refuse to load modules from `file://` for security reasons. Serve the folder with any static server, no install needed:

```bash
cd maison-verdant
python3 -m http.server 8080      # or: npx serve .   or: php -S localhost:8080
```

Then open http://localhost:8080. Any static host (Netlify, Vercel, GitHub Pages, S3) works as is.

Try: add pieces to the bag, apply `SAVE10`, `FREESHIP` or `WELCOME15`, check out with card `4242 4242 4242 4242` and any future expiry, then visit Account > Orders. Press `Ctrl/Cmd + K` for search and `?` for every shortcut. The back office lives at `/admin/` (any password of 8+ characters).

## Structure

```
index.html shop.html category.html product.html search.html cart.html checkout.html
order-confirmation.html account.html orders.html order-detail.html wishlist.html
login.html register.html forgot-password.html reset-password.html blog.html blog-post.html
about.html contact.html faq.html privacy.html terms.html returns.html shipping.html
cookies.html 404.html 500.html maintenance.html styleguide.html
admin/   index products product-edit orders order-detail customers customer-detail
         categories brands coupons reviews blog media analytics reports settings users login
css/     tokens reset base layout components pages admin animations utilities
js/      main icons theme state cart wishlist auth products filters search checkout account
         blog validation toast modal drawer carousel accordion tabs animations confetti
         recently-viewed cookie-consent back-to-top shortcuts data admin
assets/  logo.svg favicon.svg og-image.jpg placeholder.svg
```

## Notes

- Layer order is declared once in `css/tokens.css`: reset, tokens, base, layout, components, pages, admin, utilities, animations.
- `js/data.js` holds 42 products across seven categories, 168 reviews, 9 journal stories, orders, customers, coupons and staff.
- Photography loads from Unsplash (`w`, `q=80`, `auto=format`). Any image that fails falls back to `assets/placeholder.svg`, so layouts never break offline.
- State persists in localStorage under versioned keys (`mv:v1:*`) and syncs across tabs.
- Checkout, auth and admin are front-end demos: nothing is sent to a server, and card numbers are never stored. Wire them to your payment provider and API before going live.
- Every motion respects `prefers-reduced-motion`; high contrast mode is honoured through `prefers-contrast`.
