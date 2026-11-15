import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

import { useAuth } from './AuthContext';
import {
  fetchWalletNonce,
  verifyWalletSignature,
  disconnectWalletApi,
} from '../services/walletService';
import contractMeta from '../contracts/MediConsentContract.json';

const WalletContext = createContext(null);

export const HARDHAT_CHAIN_ID = 31337;
export const HARDHAT_CHAIN_HEX = '0x7a69';
export const HARDHAT_RPC_URL = 'http://127.0.0.1:8545';

export function WalletProvider({ children }) {
  const { user, setUser } = useAuth();

  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const hasMetaMask = typeof window !== 'undefined' && Boolean(window.ethereum);

  const contractAddress =
    import.meta.env.VITE_CONTRACT_ADDRESS ||
    contractMeta.contractAddress ||
    '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  const contractAbi = contractMeta.abi;

  // Check if connected address matches the authenticated user's verified address
  const isVerifiedWithAccount = useMemo(() => {
    if (!address || !user?.walletAddress) return false;
    return address.toLowerCase() === user.walletAddress.toLowerCase();
  }, [address, user?.walletAddress]);

  const isCorrectNetwork = chainId === HARDHAT_CHAIN_ID;

  // Switch or add Hardhat network
  const switchNetwork = useCallback(async () => {
    if (!hasMetaMask) return false;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: HARDHAT_CHAIN_HEX }],
      });
      setChainId(HARDHAT_CHAIN_ID);
      return true;
    } catch (switchError) {
      // Error code 4902 indicates the chain has not been added to MetaMask
      if (switchError.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: HARDHAT_CHAIN_HEX,
                chainName: 'Hardhat Local (MediConsent)',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [HARDHAT_RPC_URL],
              },
            ],
          });
          setChainId(HARDHAT_CHAIN_ID);
          return true;
        } catch (addError) {
          toast.error('Failed to add Hardhat local network to MetaMask.');
          return false;
        }
      }
      toast.error('Please switch MetaMask network to Hardhat Local (Chain ID 31337).');
      return false;
    }
  }, [hasMetaMask]);

  // Connect wallet
  const connect = useCallback(async () => {
    if (!hasMetaMask) {
      toast.error(
        'MetaMask extension is not detected. Please install MetaMask from metamask.io to use blockchain features.',
        { duration: 6000 }
      );
      return null;
    }

    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) {
        toast.error('No account selected in MetaMask.');
        return null;
      }

      const connectedAddr = ethers.getAddress(accounts[0]);
      setAddress(connectedAddr);

      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(chainIdHex, 16);
      setChainId(currentChainId);

      if (currentChainId !== HARDHAT_CHAIN_ID) {
        toast('Switching network to Hardhat Local (31337)...', { icon: '🔄' });
        await switchNetwork();
      } else {
        toast.success(`Connected wallet: ${connectedAddr.slice(0, 6)}...${connectedAddr.slice(-4)}`);
      }

      return connectedAddr;
    } catch (err) {
      if (err.code === 4001) {
        toast.error('Connection request was rejected in MetaMask.');
      } else {
        toast.error(err.message || 'Failed to connect MetaMask wallet.');
      }
      return null;
    } finally {
      setConnecting(false);
    }
  }, [hasMetaMask, switchNetwork]);

  // Cryptographic signature verification with backend
  const verifyWallet = useCallback(async () => {
    if (!address) {
      const addr = await connect();
      if (!addr) return false;
    }

    if (!isCorrectNetwork) {
      const switched = await switchNetwork();
      if (!switched) return false;
    }

    setVerifying(true);
    try {
      // 1. Request one-time nonce from backend
      const nonceData = await fetchWalletNonce();

      // 2. Request signature from MetaMask signer
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(nonceData.statement);

      // 3. Send signature to backend for verification and account association
      const result = await verifyWalletSignature({
        address,
        message: nonceData.statement,
        signature,
      });

      if (result.data?.user && setUser) {
        setUser(result.data.user);
      }

      toast.success('Wallet successfully verified and linked to your MediConsent account!');
      return true;
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        toast.error('Signature request was rejected in MetaMask.');
      } else {
        const msg = err.response?.data?.message || err.message || 'Signature verification failed.';
        toast.error(msg);
      }
      return false;
    } finally {
      setVerifying(false);
    }
  }, [address, isCorrectNetwork, connect, switchNetwork, setUser]);

  // Disconnect wallet association
  const disconnect = useCallback(async () => {
    try {
      if (user?.walletAddress) {
        await disconnectWalletApi();
        if (setUser) {
          setUser((prev) => (prev ? { ...prev, walletAddress: null } : prev));
        }
      }
      setAddress(null);
      toast.success('Wallet disconnected.');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Could not disconnect wallet.';
      toast.error(msg);
    }
  }, [user?.walletAddress, setUser]);

  // Listen for account and network changes in MetaMask
  useEffect(() => {
    if (!hasMetaMask) return;

    // Check already connected accounts
    window.ethereum
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (accounts && accounts.length > 0) {
          setAddress(ethers.getAddress(accounts[0]));
        }
      })
      .catch(() => {});

    window.ethereum
      .request({ method: 'eth_chainId' })
      .then((chainHex) => {
        if (chainHex) setChainId(parseInt(chainHex, 16));
      })
      .catch(() => {});

    const handleAccountsChanged = (accounts) => {
      if (accounts && accounts.length > 0) {
        const newAddr = ethers.getAddress(accounts[0]);
        setAddress(newAddr);
        toast(`MetaMask account switched to: ${newAddr.slice(0, 6)}...${newAddr.slice(-4)}`, {
          icon: '🦊',
        });
      } else {
        setAddress(null);
      }
    };

    const handleChainChanged = (chainHex) => {
      const newChain = parseInt(chainHex, 16);
      setChainId(newChain);
      if (newChain !== HARDHAT_CHAIN_ID) {
        toast('Network changed. Please switch back to Hardhat Local (31337).', {
          icon: '⚠️',
        });
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [hasMetaMask]);

  // Helper to obtain an ethers.Contract instance connected with signer
  const getContractWithSigner = useCallback(async () => {
    if (!hasMetaMask) throw new Error('MetaMask is not available');
    if (!isCorrectNetwork) {
      const switched = await switchNetwork();
      if (!switched) throw new Error('Incorrect network. Please switch to Hardhat Local (31337).');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, contractAbi, signer);
  }, [hasMetaMask, isCorrectNetwork, switchNetwork, contractAddress, contractAbi]);

  const value = useMemo(
    () => ({
      address,
      connected: Boolean(address),
      connecting,
      verified: isVerifiedWithAccount,
      verifying,
      userWallet: user?.walletAddress ? ethers.getAddress(user.walletAddress) : null,
      chainId,
      chainName: 'Hardhat Local',
      isCorrectNetwork,
      hasMetaMask,
      contractAddress,
      contractAbi,
      connect,
      verifyWallet,
      disconnect,
      switchNetwork,
      getContractWithSigner,
      isPreview: false,
    }),
    [
      address,
      connecting,
      isVerifiedWithAccount,
      verifying,
      user?.walletAddress,
      chainId,
      isCorrectNetwork,
      hasMetaMask,
      contractAddress,
      contractAbi,
      connect,
      verifyWallet,
      disconnect,
      switchNetwork,
      getContractWithSigner,
    ]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWallet must be used inside a WalletProvider');
  return context;
}

export default WalletContext;
