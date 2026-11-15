const fs = require('fs');
const path = require('path');
const { ethers, network } = require('hardhat');

async function main() {
  console.log('----------------------------------------------------');
  console.log('MediConsent Blockchain Deployment (Phase 9)');
  console.log('----------------------------------------------------');
  console.log(`Deploying to network: ${network.name} (Chain ID: ${network.config.chainId || 31337})`);

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer account:    ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance:    ${ethers.formatEther(balance)} ETH`);

  const MediConsent = await ethers.getContractFactory('MediConsent');
  const contract = await MediConsent.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log('----------------------------------------------------');
  console.log(`MediConsent deployed to: ${contractAddress}`);
  console.log('----------------------------------------------------');

  const deploymentData = {
    network: network.name,
    chainId: network.config.chainId || 31337,
    contractAddress: contractAddress,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
  };

  // 1. Save deployedAddress.json in blockchain directory
  const deployedAddressPath = path.join(__dirname, '..', 'deployedAddress.json');
  fs.writeFileSync(deployedAddressPath, JSON.stringify(deploymentData, null, 2), 'utf8');
  console.log(`Saved deployment info to: ${deployedAddressPath}`);

  // 2. Read compiled ABI from Hardhat artifacts
  const artifactPath = path.join(
    __dirname,
    '..',
    'artifacts',
    'contracts',
    'MediConsent.sol',
    'MediConsent.json'
  );

  if (fs.existsSync(artifactPath)) {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const abiExport = {
      contractName: artifact.contractName,
      abi: artifact.abi,
      contractAddress: contractAddress,
      chainId: network.config.chainId || 31337,
    };

    // Save ABI + address to backend config
    const backendAbiDir = path.join(__dirname, '..', '..', 'backend', 'config');
    if (!fs.existsSync(backendAbiDir)) {
      fs.mkdirSync(backendAbiDir, { recursive: true });
    }
    const backendAbiPath = path.join(backendAbiDir, 'MediConsentContract.json');
    fs.writeFileSync(backendAbiPath, JSON.stringify(abiExport, null, 2), 'utf8');
    console.log(`Exported contract info to backend:  ${backendAbiPath}`);

    // Save ABI + address to frontend contracts
    const frontendAbiDir = path.join(__dirname, '..', '..', 'frontend', 'src', 'contracts');
    if (!fs.existsSync(frontendAbiDir)) {
      fs.mkdirSync(frontendAbiDir, { recursive: true });
    }
    const frontendAbiPath = path.join(frontendAbiDir, 'MediConsentContract.json');
    fs.writeFileSync(frontendAbiPath, JSON.stringify(abiExport, null, 2), 'utf8');
    console.log(`Exported contract info to frontend: ${frontendAbiPath}`);
  }

  // 3. Update backend/.env if it exists
  const backendEnvPath = path.join(__dirname, '..', '..', 'backend', '.env');
  if (fs.existsSync(backendEnvPath)) {
    let envContent = fs.readFileSync(backendEnvPath, 'utf8');
    if (/CONTRACT_ADDRESS=/i.test(envContent)) {
      envContent = envContent.replace(
        /CONTRACT_ADDRESS=.*$/m,
        `CONTRACT_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `\nCONTRACT_ADDRESS=${contractAddress}\n`;
    }

    if (/MEDICONSENT_CONTRACT_ADDRESS=/i.test(envContent)) {
      envContent = envContent.replace(
        /MEDICONSENT_CONTRACT_ADDRESS=.*$/m,
        `MEDICONSENT_CONTRACT_ADDRESS=${contractAddress}`
      );
    } else {
      envContent += `MEDICONSENT_CONTRACT_ADDRESS=${contractAddress}\n`;
    }

    fs.writeFileSync(backendEnvPath, envContent, 'utf8');
    console.log(`Updated backend .env with CONTRACT_ADDRESS=${contractAddress}`);
  }

  console.log('Deployment complete.');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exitCode = 1;
});
