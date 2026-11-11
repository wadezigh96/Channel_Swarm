# ChannelSwarm MCP PayPal Quickstart

Panduan ini menjalankan MCP server ChannelSwarm melalui transport `stdio`. MCP server menyediakan metadata PYUSD, preflight Solana, dan operasi PayPal Orders v2.

Untuk skenario lengkap create → approve → capture → verify di PayPal Sandbox, lanjutkan ke [Panduan E2E PayPal Sandbox](MCP_PAYPAL_SANDBOX_E2E.md).

## 1. Siapkan project

```bash
git clone https://github.com/wadezigh96/Channel_Swarm.git
cd Channel_Swarm
npm install
cp .env.example .env
```

Untuk mode aman, gunakan PayPal Sandbox dan jangan mengaktifkan transaksi mainnet:

```dotenv
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_LIVE_ENABLED=false
PAYPAL_LIVE_CAPTURE_ENABLED=false
NETWORK=devnet
PYUSD_NETWORK=devnet
ONCHAIN=false
```

`devnet` adalah default aman. `NETWORK`, `PYUSD_NETWORK`, dan fallback RPC PYUSD harus menunjuk jaringan yang sama. Untuk mainnet, ubah `PYUSD_NETWORK=mainnet` dan sediakan RPC mainnet secara sengaja setelah review operasional; jangan mencampur `NETWORK=devnet` dengan `PYUSD_NETWORK=mainnet`.

Jangan memasukkan private key atau client secret ke source code, dashboard browser, commit, atau prompt MCP. MCP server membaca credential dari environment proses server.

## 2. Verifikasi CLI terlebih dahulu

```bash
npm run cli -- pyusd info
npm run cli -- pyusd preflight
npm test
npm run build
```

Preflight hanya membaca mint dan status kompatibilitas. Ia tidak mengirim transaksi. Dengan default di atas, CLI memilih mint PYUSD devnet dan `https://api.devnet.solana.com` secara otomatis. Gunakan `--rpc` hanya jika memang ingin mengganti endpoint.

## 3. Jalankan MCP server

```bash
npm run mcp
```

Server membaca satu pesan JSON-RPC per baris dari `stdin` dan mengirim respons JSON-RPC ke `stdout`. Untuk smoke test:

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
'{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"channelswarm_pyusd_info","arguments":{}}}' \
| npm run mcp
```

## 4. Daftarkan ke client MCP

Contoh konfigurasi client MCP yang mendukung `command`, `args`, dan `env`:

```json
{
  "mcpServers": {
    "channelswarm": {
      "command": "npm",
      "args": ["--prefix", "/absolute/path/to/Channel_Swarm", "run", "mcp"],
      "env": {
        "PAYPAL_MODE": "sandbox",
        "PAYPAL_CLIENT_ID": "your_sandbox_client_id",
        "PAYPAL_CLIENT_SECRET": "your_sandbox_client_secret",
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

Sesuaikan lokasi file konfigurasi dan absolute path dengan aplikasi MCP yang digunakan. Restart client MCP setelah menyimpan konfigurasi. Jika client MCP tidak meneruskan `env`, jalankan server dari shell yang sudah memuat `.env`, atau isi variabel pada blok `env` seperti contoh di atas.

## 5. Tool yang tersedia

- `channelswarm_pyusd_info` — metadata mint PYUSD untuk network yang dipilih. Read-only.
- `channelswarm_solana_pyusd_preflight` — memvalidasi mint Token-2022 dan kompatibilitas Payment Channels. Read-only.
- `channelswarm_paypal_create_order` — membuat PayPal order dan mengembalikan approval URL. Tidak melakukan capture.
- `channelswarm_paypal_get_order` — membaca status order berdasarkan ID.
- `channelswarm_paypal_capture_order` — melakukan capture order yang sudah disetujui. Wajib mengirim `confirm: "CAPTURE"`.

Contoh pemanggilan create order dalam percakapan dengan client MCP:

```json
{
  "name": "channelswarm_paypal_create_order",
  "arguments": {
    "amount": 5.00,
    "description": "ChannelSwarm sandbox settlement"
  }
}
```

Setelah customer menyetujui order di PayPal, capture harus diminta secara terpisah:

```json
{
  "name": "channelswarm_paypal_capture_order",
  "arguments": {
    "orderId": "ORDER_ID_DARI_PAYPAL",
    "confirm": "CAPTURE"
  }
}
```

## 6. Batas keamanan

PayPal Orders dan PYUSD di Solana adalah dua rail yang berbeda. Membuat atau menangkap PayPal order tidak mengirim PYUSD ke Solana, dan pembayaran PYUSD tidak otomatis membuat PayPal order.

Untuk penggunaan mainnet, lakukan preflight dengan RPC mainnet, periksa alamat penerima, mint, saldo PYUSD, saldo SOL untuk fee, dan Token-2022 extensions. Transaksi on-chain harus memakai wallet yang memang disediakan untuk operasi tersebut. Jangan mengaktifkan mainnet hanya untuk menghilangkan label status; gunakan nominal kecil dan approval operator yang terdokumentasi.

Capture PayPal live dan transaksi Solana mainnet tidak boleh dijalankan sebagai smoke test otomatis. Mulai dari Sandbox/devnet, lalu lakukan review payload sebelum setiap tindakan finansial.

## 7. Troubleshooting

### Metadata menunjukkan network dan mint yang berbeda

Pastikan pasangan berikut konsisten:

```text
NETWORK=devnet
PYUSD_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
```

Lalu jalankan:

```bash
npm run cli -- pyusd info
npm run cli -- pyusd preflight
```

Output harus menunjukkan `network: devnet`, mint `CXk2AMBfi3TwaEL2468s6zP8xq9NxTXjp9gjMgzeUynM`, dan RPC devnet. Jika output menyebut mint tidak ditemukan atau bukan Token-2022, periksa apakah RPC dan `PYUSD_NETWORK` menunjuk jaringan yang sama.
