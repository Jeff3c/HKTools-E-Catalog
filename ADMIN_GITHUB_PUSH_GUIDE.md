# Admin GitHub Push Guide

This guide is for `admin.html` GitHub push controls.

## 1) Fill GitHub fields

- Personal Access Token: use a token that can write repository contents.
- Owner: `Jeff3c`
- Repo: `HKTools-E-Catalog`
- Branch: `main`
- Remote path: `catalog-data.js`
- Commit message: any clear message, for example `Update product P0123 image`

## 2) Token permission (recommended)

For fine-grained token:

- Repository access: `HKTools-E-Catalog`
- Permissions:
- `Contents: Read and write`
- `Metadata: Read`

For classic token:

- Scope: `repo`

## 3) Edit and push safely

- Open `admin.html` and login.
- Edit one product at a time.
- If you upload/paste an image, the push flow will upload it to `images/...` and rewrite image path automatically.
- Click `推送到 GitHub`.
- Wait for status `GitHub 推送完成` (it may include a short commit SHA).

## 4) Quick verification

After push, check all three URLs:

- Site home:
- `https://jeff3c.github.io/HKTools-E-Catalog/?t=TIMESTAMP`
- Raw data (main):
- `https://raw.githubusercontent.com/Jeff3c/HKTools-E-Catalog/main/catalog-data.js`
- Actions runs:
- `https://github.com/Jeff3c/HKTools-E-Catalog/actions`

Expected:

- `catalog-data.js` is not empty.
- Latest `pages build and deployment` run on `main` is `success`.
- Catalog page shows product count > 0.

## 5) Dry run without token

To validate form wiring only (without creating commits):

- Clear token field.
- Click `推送到 GitHub`.
- Expected status: `請輸入 GitHub token`.

## 6) Recovery (Option A, GitHub Web UI on main)

If a bad push causes empty or broken catalog:

1. Open commit history for `catalog-data.js`:
- `https://github.com/Jeff3c/HKTools-E-Catalog/commits/main/catalog-data.js`
2. Open the last known good commit.
3. Click `Browse files` from that commit.
4. Open `catalog-data.js`.
5. Click `...` then `Copy raw file` (or open `Raw` and copy all).
6. Go to current `main/catalog-data.js` and click edit (pencil icon).
7. Replace all content with the good version.
8. Commit directly to `main`.
9. Wait for Pages deployment to complete, then refresh with `?t=TIMESTAMP`.

## 7) Security notes

- Do not hardcode token in source files.
- If you enabled `記住 token`, it is stored only in local browser storage.
- Revoke and recreate token immediately if leaked.
