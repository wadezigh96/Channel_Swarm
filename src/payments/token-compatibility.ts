import { ExtensionType } from "@solana/spl-token";

/** Mint extensions currently accepted by the deployed Payment Channels program. */
export const CHANNEL_SUPPORTED_MINT_EXTENSIONS = new Set<ExtensionType>([
  ExtensionType.MetadataPointer,
  ExtensionType.TokenMetadata,
  ExtensionType.GroupPointer,
  ExtensionType.TokenGroup,
  ExtensionType.GroupMemberPointer,
  ExtensionType.TokenGroupMember,
]);

export function findUnsupportedChannelMintExtensions(extensions: ExtensionType[]): ExtensionType[] {
  return extensions.filter((extension) => !CHANNEL_SUPPORTED_MINT_EXTENSIONS.has(extension));
}
