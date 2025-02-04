import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import { Box, Heading, Text as SnapText } from '@metamask/snaps-sdk/jsx';

export const ProxyDialog: SnapComponent = () => {
  return (
    <Box center children={false}>
      <Heading children={false}>TrustVault Proxy is not in use</Heading>
      <SnapText alignment={'center'} children={false}>
        It seems that you have the snap enhanced mode enabled but are not using
        the TrustVault proxy for rpc requests. That is likely due to a new
        network being added to Metamask.
      </SnapText>
      <SnapText alignment={'center'} children={false}>
        Please navigate to TVW to either turn enhanced mode off or configure
        Metamask to use the TrustVault Proxy.
      </SnapText>
    </Box>
  );
};
