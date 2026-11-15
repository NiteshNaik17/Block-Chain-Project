import api from './api';

export async function fetchWalletNonce() {
  const response = await api.get('/wallet/nonce');
  return response.data.data;
}

export async function verifyWalletSignature({ address, message, signature }) {
  const response = await api.post('/wallet/verify', { address, message, signature });
  return response.data;
}

export async function fetchWalletStatus() {
  const response = await api.get('/wallet/status');
  return response.data.data;
}

export async function disconnectWalletApi() {
  const response = await api.post('/wallet/disconnect');
  return response.data;
}

export default {
  fetchWalletNonce,
  verifyWalletSignature,
  fetchWalletStatus,
  disconnectWalletApi,
};
