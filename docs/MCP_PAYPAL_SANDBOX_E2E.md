# PayPal Sandbox E2E untuk ChannelSwarm MCP

Panduan ini memverifikasi integrasi PayPal Sandbox dari pembuatan order sampai capture melalui MCP. Pengujian menggunakan uang dan akun sandbox PayPal, bukan dana produksi.

## Cakupan

Alur utama yang diuji:

1. MCP server aktif melalui `stdio`.
2. `channelswarm_paypal_create_order` membuat order Sandbox.
3. Sandbox buyer menyetujui order melalui `approveUrl`.
4. `channelswarm_paypal_get_order` mengonfirmasi status `APPROVED`.
5. `channelswarm_paypal_capture_order` melakukan capture setelah konfirmasi eksplisit.
6. `get_order` mengonfirmasi status akhir `COMPLETED` dan capture ID.

Webhook dan durable ledger adalah jalur HTTP terpisah. MCP PayPal memanggil PayPal Orders API secara langsung; MCP capture tidak otomatis menulis ke `api/paypal-order.ts`. Gunakan bagian webhook/ledger di bawah jika ingin menguji jalur aplikasi Vercel juga.

## Prasyarat

Siapkan hal berikut di PayPal Developer Dashboard Sandbox:

- Sandbox REST app.
- Sandbox Client ID.
- Sandbox Secret.
- Sandbox Personal/Buyer account untuk approval.
- Browser yang dapat login ke akun buyer Sandbox.

Jangan memakai credential Live. Jangan menaruh secret di Git, file yang dikomit, client MCP yang dibagikan, atau prompt.

Repository menyediakan runner otomatis Node.js. Runner menolak `PAYPAL_MODE=live`, default-nya hanya membuat order, dan hanya menjalankan capture jika flag `--capture` diberikan.

Validasi tanpa credential atau request jaringan:

```bash
npm run e2e:paypal:sandbox -- --dry-run
```

Setelah credential Sandbox tersedia, create-only E2E:

```bash
npm run e2e:paypal:sandbox -- --amount=5.00
```

Untuk alur penuh, buka approval URL yang dicetak, login sebagai Sandbox buyer, lalu jalankan runner dengan capture sebelum batas waktu habis:

```bash
npm run e2e:paypal:sandbox -- \
  --amount=5.00 \
  --capture \
  --timeout-seconds=300 \
  --poll-seconds=5
```

Runner akan melakukan initialize, memeriksa tool MCP, membuat order, polling `APPROVED`, mengirim capture dengan `confirm: "CAPTURE"`, dan memverifikasi `COMPLETED`. `--capture` tetap merupakan pilihan eksplisit karena membuat perubahan finansial pada akun Sandbox.

## 1. Konfigurasi lokal

```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
cp .env.example .env
```

Isi `.env` dengan credential Sandbox:

```dotenv
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=REPLACE_WITH_SANDBOX_CLIENT_ID
PAYPAL_CLIENT_SECRET=REPLACE_WITH_SANDBOX_SECRET
PAYPAL_LIVE_ENABLED=false
PAYPAL_LIVE_CAPTURE_ENABLED=false

NETWORK=devnet
PYUSD_NETWORK=devnet
ONCHAIN=false
```

Jalankan validasi lokal:

```bash
npm test
npm run build
npm run cli -- pyusd info
```

## 2. Jalankan MCP server

```bash
npm run mcp
```

Untuk client MCP yang menjalankan server sebagai child process, gunakan konfigurasi berikut. Ganti absolute path dan credential dengan nilai lokal Anda; jangan commit file ini.

```json
{
  "mcpServers": {
    "channelswarm": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/Channel_Swarm", "run", "mcp"],
      "env": {
        "PAYPAL_MODE": "sandbox",
        "PAYPAL_CLIENT_ID": "REPLACE_WITH_SANDBOX_CLIENT_ID",
        "PAYPAL_CLIENT_SECRET": "REPLACE_WITH_SANDBOX_SECRET",
        "PAYPAL_LIVE_ENABLED": "false",
        "PAYPAL_LIVE_CAPTURE_ENABLED": "false",
        "NETWORK": "devnet",
        "PYUSD_NETWORK": "devnet",
        "ONCHAIN": "false"
      }
    }
  }
}
```

Verifikasi MCP sebelum membuat order:

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| npm run mcp
```

Pastikan daftar tools mencakup `channelswarm_paypal_create_order`, `channelswarm_paypal_get_order`, dan `channelswarm_paypal_capture_order`.

## 3. Create order melalui MCP

Panggil tool berikut dari client MCP:

```json
{
  "name": "channelswarm_paypal_create_order",
  "arguments": {
    "amount": 5.00,
    "description": "ChannelSwarm Sandbox E2E"
  }
}
```

Hasil yang diharapkan:

```json
{
  "id": "SANDBOX_ORDER_ID",
  "status": "CREATED",
  "approveUrl": "https://www.sandbox.paypal.com/checkoutnow?...",
  "mode": "sandbox"
}
```

Simpan `id` dan buka `approveUrl` di browser. Jangan menganggap order berhasil dibayar hanya karena status `CREATED`; approval buyer belum terjadi.

## 4. Approve sebagai Sandbox buyer

1. Buka `approveUrl`.
2. Login menggunakan Sandbox Personal/Buyer account, bukan akun Business/Merchant.
3. Periksa nominal dan merchant.
4. Approve/Pay.
5. Biarkan browser kembali ke `PAYPAL_RETURN_URL` atau salin `orderId` dari hasil redirect.

Jika approval gagal, jangan capture. Periksa bahwa buyer account adalah account Sandbox dan order dibuat oleh Client ID dari Sandbox Business account yang benar.

## 5. Verifikasi status APPROVED

Setelah approval, panggil:

```json
{
  "name": "channelswarm_paypal_get_order",
  "arguments": {
    "orderId": "SANDBOX_ORDER_ID"
  }
}
```

Hasil yang diharapkan sebelum capture:

```json
{
  "id": "SANDBOX_ORDER_ID",
  "status": "APPROVED"
}
```

Jika status masih `CREATED`, tunggu sebentar dan ulangi `get_order`. Jika status `VOIDED`, `CANCELLED`, atau tidak sesuai, hentikan pengujian dan buat order Sandbox baru.

## 6. Capture dengan konfirmasi eksplisit

Capture adalah tindakan finansial terhadap akun Sandbox. Pastikan order ID dan nominal sudah cocok, lalu panggil tool dengan sentinel konfirmasi:

```json
{
  "name": "channelswarm_paypal_capture_order",
  "arguments": {
    "orderId": "SANDBOX_ORDER_ID",
    "confirm": "CAPTURE"
  }
}
```

MCP menolak capture tanpa `confirm: "CAPTURE"`. Hasil yang diharapkan:

```json
{
  "id": "SANDBOX_ORDER_ID",
  "status": "COMPLETED",
  "purchase_units": [
    {
      "payments": {
        "captures": [
          {
            "id": "SANDBOX_CAPTURE_ID",
            "status": "COMPLETED"
          }
        ]
      }
    }
  ]
}
```

Panggil `channelswarm_paypal_get_order` sekali lagi untuk memastikan status akhir `COMPLETED`. Jangan memanggil capture berulang kali untuk order yang sudah selesai.

## 7. Verifikasi jalur HTTP order ledger (opsional)

Jalur HTTP Vercel menggunakan `api/paypal-order.ts`, bukan MCP stdio. Jalur ini memerlukan Upstash/Vercel KV yang persisten:

```dotenv
KV_REST_API_URL=https://your-upstash-endpoint
KV_REST_API_TOKEN=REPLACE_WITH_UPSTASH_TOKEN
PAYPAL_WEBHOOK_ID=REPLACE_WITH_SANDBOX_WEBHOOK_ID
```

Setelah aplikasi dideploy ke URL HTTPS Sandbox/Preview:

```bash
curl -sS -X POST "https://YOUR_HOST/api/paypal-order" \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 203.0.113.10' \
  -d '{"action":"create","amount":5.00,"description":"ChannelSwarm HTTP E2E"}'
```

Respons yang diharapkan adalah `200` dengan `success: true`, `order.id`, dan `approveUrl`. Endpoint mengembalikan `503` jika durable ledger belum dikonfigurasi; itu berarti konfigurasi belum lengkap, bukan kegagalan PayPal order.

Baca record ledger setelah order dibuat:

```bash
curl -sS "https://YOUR_HOST/api/paypal-order?orderId=SANDBOX_ORDER_ID"
```

Setelah buyer menyetujui order, capture melalui jalur HTTP:

```bash
curl -sS -X POST "https://YOUR_HOST/api/paypal-order" \
  -H 'Content-Type: application/json' \
  -d '{"action":"capture","orderId":"SANDBOX_ORDER_ID"}'
```

Endpoint memeriksa bahwa order ada di ledger, nominal provider sama dengan nominal ledger, dan status provider `APPROVED` sebelum capture.

## 8. Verifikasi webhook Sandbox (opsional)

Webhook membutuhkan URL publik HTTPS yang dapat dijangkau PayPal Sandbox. Daftarkan webhook di PayPal Developer Dashboard untuk event yang relevan, minimal:

- `CHECKOUT.ORDER.APPROVED`
- `CHECKOUT.ORDER.COMPLETED`
- `PAYMENT.CAPTURE.PENDING`
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REVERSED`
- Event refund yang dipakai oleh alur aplikasi

Set `PAYPAL_WEBHOOK_ID` dengan ID webhook yang terdaftar. Jangan menguji signature dengan header buatan; endpoint memanggil PayPal `verify-webhook-signature` menggunakan transmission headers asli:

- `paypal-auth-algo`
- `paypal-cert-url`
- `paypal-transmission-id`
- `paypal-transmission-sig`
- `paypal-transmission-time`

Hasil webhook yang diharapkan:

```json
{"received":true,"duplicate":false}
```

Kirim ulang event yang sama untuk menguji deduplikasi:

```json
{"received":true,"duplicate":true}
```

Jika endpoint mengembalikan `503`, periksa credential Sandbox, `PAYPAL_WEBHOOK_ID`, dan Upstash URL/token. Jika mengembalikan `400` untuk signature, jangan menonaktifkan verifikasi; periksa URL webhook, environment Sandbox, dan header asli dari PayPal.

## 9. Acceptance checklist

- [ ] MCP initialize berhasil.
- [ ] `tools/list` mencantumkan tiga tool PayPal.
- [ ] Create order mengembalikan `CREATED` dan `approveUrl`.
- [ ] Sandbox buyer berhasil approve order.
- [ ] Get order mengembalikan `APPROVED` sebelum capture.
- [ ] Capture hanya dikirim dengan `confirm: "CAPTURE"`.
- [ ] Capture mengembalikan `COMPLETED` dan capture ID.
- [ ] Get order terakhir mengembalikan `COMPLETED`.
- [ ] Jika HTTP ledger diuji, record order tersimpan di durable store.
- [ ] Jika webhook diuji, signature valid dan event kedua dideduplikasi.
- [ ] Tidak ada credential Live, private key, atau transaksi Solana mainnet yang digunakan.

## Troubleshooting ringkas

| Gejala | Pemeriksaan pertama |
|---|---|
| `paypal_credentials_missing` | Pastikan Client ID/Secret adalah credential Sandbox dan diteruskan ke proses MCP. |
| `PayPal auth failed: 401` | Pastikan pasangan Client ID/Secret berasal dari Sandbox app yang sama. |
| Order `CREATED` tidak berubah | Pastikan approval memakai Sandbox Personal/Buyer account. |
| Capture ditolak | Pastikan status `APPROVED` dan `confirm` persis `CAPTURE`. |
| `503` pada HTTP ledger | Isi `KV_REST_API_URL` dan `KV_REST_API_TOKEN`. |
| Webhook signature gagal | Gunakan `PAYPAL_WEBHOOK_ID` yang terdaftar di environment Sandbox yang sama. |
| PYUSD preflight gagal | Pastikan `NETWORK`, `PYUSD_NETWORK`, dan RPC menunjuk jaringan yang sama; ini terpisah dari PayPal Sandbox. |
