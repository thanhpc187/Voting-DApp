# Voting DApp (Sepolia) — React + Vite + MetaMask

Ứng dụng bỏ phiếu chạy trên Ethereum testnet **Sepolia**. Dữ liệu (cuộc bầu cử/ứng viên/phiếu bầu) được lưu trong smart contract trên blockchain; giao diện web dùng MetaMask để ký giao dịch.

### Yêu cầu
- **Node.js** (khuyến nghị LTS)
- **MetaMask** (Chrome/Edge) và chọn mạng **Sepolia**

### Chạy ứng dụng (chỉ cần làm khi clone về)
Không cần Alchemy key, không cần private key để chạy UI.

```powershell
npm install
npm run dev
```

Mở `http://localhost:5173` → Connect MetaMask → sử dụng.

### Smart contract address
Ứng dụng đang trỏ tới contract address trong `src/constants/contract.js` (`CONTRACT_ADDRESS`).  
Muốn nhiều máy thấy chung dữ liệu thì **cùng dùng một CONTRACT_ADDRESS**.

### (Tuỳ chọn) Deploy contract mới (tạo “database” mới)
Chỉ cần khi bạn muốn **deploy một contract mới** (địa chỉ mới, dữ liệu trống).

1) Tạo file `.env` (không commit) ở thư mục gốc:
- `SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>`
- `DEPLOYER_PRIVATE_KEY=0x<YOUR_PRIVATE_KEY>`

2) Compile + deploy:

```powershell
npm run compile
npm run deploy:sepolia
```

3) Copy địa chỉ contract được in ra và cập nhật lại `src/constants/contract.js`.

### (Tuỳ chọn) Alchemy RPC cho read-only
Nếu muốn load dữ liệu ổn định hơn, tạo `.env.local` (không commit):
- `VITE_ALCHEMY_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<YOUR_KEY>`
