# BRANDON E-Commerce Website

## Project structure
```
server.js, package.json, .env.example   backend (Express + Razorpay), run from this folder
server-data/                            stock.json lives here, never exposed publicly
public/                                 the only folder served to browsers
  *.html                                pages (index, fashion-gallery, kids-fashion, contentDetails, cart, checkout, ...)
  partials/                             shared header, footer, home slider and home content
  css/                                  header, footer, page styles + theme.css (design tokens, loaded last)
  js/                                   site.js (loads partials), page scripts, vendor/jquery
  data/categories.json, img/, manifest.json, service-worker.js
```
Run: `npm install`, copy `.env.example` to `.env`, then `npm start`.

## Products
All products (men, boys, girls) live in `server-data/products.json`. Edit that file to change names, prices, `mrp` (original price), `sale` tag, or to add products.
The server merges them with the online demo products and serves them at `/api/products`; cart totals are always calculated from this list on the server.
Sizes: set `"sizes": ["S","M","L"]` per product (leave it out for products without sizes). The chosen size is saved in the cart and in the order.
To add a photo: copy the image to `public/img/products/` and set `"preview": "img/products/yourfile.jpg"` for that product. Until then a "Photo coming soon" placeholder is shown.
Restart is not needed after editing products.json, just refresh the page.

## Added in this update
- My Orders + order tracking timeline.
- Razorpay checkout integration (test/live credentials are supplied through `.env`, never hard-coded).
- Server-side cart total calculation from product data.
- Server-side Razorpay signature verification before an order is marked paid.
- Server-side stock validation and stock decrement only after successful payment verification.
- If verification fails, the order is not created and stock is not decremented.
- Helmet security headers and API rate limiting.
- `public/` is the only directory exposed by Express static serving.

## Run
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Add Razorpay test credentials from your Razorpay dashboard.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

For UI-only testing without Razorpay, set `DEMO_PAYMENT=true`. Demo payment is not a real payment and should never be used for production.

## Login required + Payments (latest update)
- Guests can browse, but **Add to Cart, Cart and Checkout need an account**. A guest is sent to Create Account / Sign In and brought back to the same page after signing in.
- Checkout asks for a delivery address (saved addresses or add a new one) and a payment method:
  - **Pay Online (UPI / QR)**: customer pays to your UPI ID / QR, then enters the UPI transaction ID (UTR). The order is saved as "Pending Verification".
  - **Cash on Delivery**: order is saved as "Pay on Delivery"; it becomes Paid automatically when you mark it Delivered.
  - **Card / NetBanking (Razorpay)**: shown only if Razorpay keys are set in `.env`.
- **Your UPI details**: open `server-data/payment-settings.json` and set `upi.upiId` (e.g. `yourname@okhdfcbank`) and `upi.payeeName`. Put your QR image at `public/img/upi-qr.png`. Until a real UPI ID is set, the UPI option stays hidden. If the QR image is missing, a QR is generated from the UPI ID.
- **Verify UPI payments**: open `/admin.html` (set `ADMIN_KEY` in `.env`). Check the UTR in your UPI/bank app, then press "Payment received" (order becomes Confirmed) or "Reject" (order is cancelled and stock restored).

## Policies, About and categories (latest update)
- New pages in `public/`: `return-policy.html`, `terms.html`, `privacy.html`, `about.html` (with contact details). `policies.html` is now a small hub and keeps the Shipping Policy.
- Contact details (email and phone) are in `about.html`, `partials/footer.html` and the policy pages. Search for the email/phone to change them.
- Return window is **7 days from delivery**. It is written in `return-policy.html` and enforced by `RETURN_WINDOW_DAYS` in `server.js`. Change both together.
- Home page has a "Shop by category" section (Men's Pants/Shirts/T-shirts, Boys, Girls) in `partials/home-content.html`.
- Create Account and Checkout show a consent line linking to Terms, Privacy and Return policy.

## Important
The existing account system is still browser-local for this project version. A production store should move users, passwords, orders and account data to a secure database/backend and hash passwords server-side.


## WhatsApp, PDF invoice and admin key (latest update)
- **Chat with us**: green WhatsApp button on every page (bottom-right). Number is `SHOPLANE_WA_NUMBER` at the bottom of `public/js/site.js` (country code + number, no +).
- **Order on WhatsApp**: after an order the customer sees "Send order on WhatsApp" (order details pre-filled to your number). In **My Orders** there is a "Help on WhatsApp" button.
- **Notify customer**: in the admin dashboard every order has a "WhatsApp customer" button that opens WhatsApp with the order status message ready to send. (Fully automatic messages need the paid WhatsApp Business API - not included.)
- **PDF invoice**: "Download invoice (PDF)" on the order confirmation page and in My Orders; admin gets "Invoice PDF" per order. Store name/phone/email for the invoice are in `STORE` in `server.js`.
- **Admin key**: `.env` has `ADMIN_KEY` (long random value). The dashboard is `/admin.html`. The admin API stays disabled if the key is missing, shorter than 16 characters, or still the placeholder. Never share `.env`.


## Forgot password, no-email order page, push notifications (latest update)
- Order page no longer claims an email was sent.
- **Forgot password**: "Forgot password?" on Sign In -> customer enters email -> gets a 6-digit code (15 min, max 5 wrong tries). The code is never shown on the website.
  - **Email**: fill `SMTP_USER`, `SMTP_PASS` (Gmail App Password) in `.env` and the code is mailed automatically.
  - **WhatsApp / fallback**: every active request is listed in Admin Dashboard > "Password reset requests" with "WhatsApp code" and "Email code" buttons. The customer also has a "Code nahi mila? WhatsApp" button.
- **Push notifications**: customer taps "Enable Notifications" (My Account). They then get a notification when the order is placed and whenever you change the order status or payment status in the admin dashboard - even if the site is closed (needs HTTPS on the live site, or localhost). Uses VAPID keys in `.env` (already generated). While the site is open a 60-second check is a backup.
- Run `npm install` again (new packages: nodemailer, web-push).

## Admin: products, stock and payment settings (latest update)
Open `/admin.html` and use the new sections - no more editing JSON by hand:
- **Products & stock**: search, add, edit, delete products; set price/MRP, sizes, brand, section/type, "Sale" tag; upload main + extra photos (JPG/PNG/WEBP, max 5 MB, saved in `public/img/products/`); change stock per product (Low/Out of stock is flagged). Changes go live immediately, no restart. Products coming from the online demo feed (accessories) are not editable here.
- **Payment settings**: turn Cash on Delivery / UPI on or off, set UPI ID and payee name, upload the QR image.
- `server-data/products.json` and `payment-settings.json` are still the storage, so back them up (together with `stock.json`, `database.json` and `public/img/products/`).

## Shop by brand (latest update)
- Home page: "Shop by brand" tiles (auto-created from the `brand` of every product) and a Brand filter in the search/filter bar.
- `brands.html` lists all brands; `brands.html?brand=shoplane` shows one brand's products (search + sort inside). Linked from the menu and footer.
- New brand = just type a new Brand name when adding/editing a product in the admin dashboard; its tile appears automatically.
- Fix: product cards, product page and "Add to cart" now use the real stock saved by the server (admin dashboard), not a browser-only number.

## Data safety: backups, restore, persistent storage (latest update)
Data (customers, orders, stock, products, coupons, reviews, payment settings) is still stored in JSON files - fine for a small/medium store - but it is now protected:
- **Crash-safe saving**: files are written to a temp file and renamed, so a power cut or crash can never leave a half-written file. If a data file is ever found damaged, the newest backup is restored automatically (the damaged file is kept as `*.damaged-<time>`), instead of silently starting with an empty store.
- **Automatic backups**: on start and every 6 hours (only when something changed) a snapshot is saved in `<data folder>/backups/` (latest 40 kept, `BACKUP_KEEP` in `.env` changes this).
- **Daily e-mail backup**: when SMTP is set in `.env` (SMTP_USER, SMTP_PASS), a full backup (data + product photos) is e-mailed every day to `BACKUP_EMAIL` (default SMTP_USER). This is your off-site copy - if the hosting disk is lost, you can still restore.
- **Admin dashboard > Backup & restore**: download a full backup file, "Backup now", e-mail it now, restore from a backup file, or restore any server copy. Every restore first saves a "before-restore" safety copy.
- **Hosting**: most hosting services (Render, Railway, Heroku, etc.) erase the app folder on every restart/deploy. Attach a persistent disk/volume and set `DATA_DIR=/path/to/that/disk` in `.env` (the first start copies the current data there). Product photos are stored in `public/img/products/`, so keep that folder on persistent storage too (or restore photos from a backup file).
- When the store grows large (thousands of orders per month, or several servers), move to a real database such as PostgreSQL - the backup file makes that migration easy.

## Google login, pincode check, Analytics, auto messages (latest update)
All four are optional. Keys go in `.env` (on Render: Environment Variables). Without a key the feature stays off and nothing breaks.
- **Continue with Google**: create an OAuth Client ID (type *Web application*) in Google Cloud Console > APIs & Services > Credentials. Add your site URL (e.g. `https://fashion-store-2w9s.onrender.com`) under *Authorized JavaScript origins*. Put the ID in `GOOGLE_CLIENT_ID`. The button then appears on Sign In / Create Account. The server verifies Google's token before signing the customer in.
- **Pincode delivery check**: works out of the box on every product page ("Check delivery"). Uses India Post's free pincode API and estimates delivery days from Maharashtra (change `pinEstimate()` in `server.js` to adjust days). The customer's pincode is remembered in the browser.
- **Google Analytics 4**: put your Measurement ID (`G-XXXXXXXXXX`) in `GA_MEASUREMENT_ID`. Page views, `add_to_cart` and `purchase` events are sent. The admin page is never tracked.
- **Auto WhatsApp / SMS to customer** (order placed + every status/payment change), sent to the phone number of the delivery address:
  - WhatsApp: Meta WhatsApp Cloud API. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` and `WHATSAPP_TEMPLATE` (an approved template whose body is just `{{1}}`). Business-initiated messages need an approved template.
  - SMS: Fast2SMS. Set `FAST2SMS_KEY`.
  - Failures are only written to the server log; they never block an order.
- Product photos: the 45 products that showed "Photo coming soon" now use photos from the `Images` folder (reused randomly by type). Replace them any time from the admin dashboard.
