import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import { Box, Heading, Link, Text as SnapText } from '@metamask/snaps-sdk/jsx';

export const ProxyDialog: SnapComponent = () => {
  return (
    <Box center>
      <Heading>TrustVault Proxy is not in use</Heading>
      <SnapText alignment={'center'}>
        You️ have the snap enhanced mode enabled but are not using the
        TrustVault proxy for rpc requests. That is likely due to a new network
        being added to Metamask.
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

type InvalidSessionDialogProps = {
  trustId: string;
};

export const InvalidSessionDialog: SnapComponent<InvalidSessionDialogProps> = ({
  trustId,
}) => {
  return (
    <Box center>
      <SnapText alignment={'center'}>Session expired</SnapText>
      <SnapText alignment={'center'}>
        Organisation with Trust ID: {trustId} and all associated accounts have
        been logged out. Please navigate to Trust Vault Web to reconnect
        Metamask to your Trust Vault account.
      </SnapText>
    </Box>
  );
};
