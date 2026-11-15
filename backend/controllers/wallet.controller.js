import {
  createWalletNonce,
  verifyAndLinkWallet,
  getWalletStatus,
  disconnectWallet,
} from '../services/wallet.service.js';

export async function getNonce(req, res, next) {
  try {
    const data = await createWalletNonce(req.user._id);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function verifySignature(req, res, next) {
  try {
    const { address, message, signature } = req.body;
    const result = await verifyAndLinkWallet(req.user, { address, message, signature });
    return res.status(200).json({
      success: true,
      message: 'Wallet signature verified and account linked successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getStatus(req, res, next) {
  try {
    const data = await getWalletStatus(req.user);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function disconnect(req, res, next) {
  try {
    const data = await disconnectWallet(req.user);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  getNonce,
  verifySignature,
  getStatus,
  disconnect,
};
