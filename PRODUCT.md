# Product truth

- Product: Mojassam 3D, a browser-only 3D model preview and rough print-cost estimator.
- Audience: makers, students, designers, and small 3D-printing customers.
- Primary job: choose a 3D file, inspect it immediately, understand its size, and get a clearly labeled preliminary estimate.
- Supported files in v1: STL, OBJ, and 3MF up to 50MB.
- Privacy: files are parsed locally and are never uploaded or stored.
- Accounts: Local email/password sign-in backed by SQLite on Namecheap, with a lightweight profile and order history.
- Out of scope: sharing, payment, cloud model storage, and exact slicer-based quotes.
- Orders: preliminary requests for a ready design or an uploaded model (the file stays on the device); the server computes every price.
- Admin dashboard (`/admin`, emails in `ADMIN_EMAILS`): receives all orders, sets status / final price / a note the customer sees in their account, and edits pricing (gram price per material, machine-hour rate, time multiplier, setup fee, minimum order), colors, ready designs, and pausing orders. Prices are stored in SQLite and applied to new orders immediately.
