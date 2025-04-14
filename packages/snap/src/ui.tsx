import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import { Box, Heading, Link, Text as SnapText } from '@metamask/snaps-sdk/jsx';

export const ProxyDialog: SnapComponent = () => {
  return (
    <Box center>
      <Heading>TrustVault Proxy is not in use</Heading>
      <SnapText alignment={'center'}>
        It seems that you have the snap enhanced mode enabled but are not using
        the TrustVault proxy for rpc requests. That is likely due to a new
        network being added to Metamask.
      </SnapText>
      <SnapText alignment={'center'}>
        Please navigate to{' '}
        <Link href="https://app.bitpandacustody.com/metamask-snap">
          Trust Vault Web
        </Link>{' '}
        to turn enhanced mode off or enable the TrustVault Proxy.
      </SnapText>
    </Box>
  );
};
