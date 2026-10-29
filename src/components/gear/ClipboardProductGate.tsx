// ClipboardProductGate.tsx — mounts the background clipboard recognition inside
// the signed-in app and shows the centred card when a shop link was recognized.
// Native only (AppRoot); the web guest app has its own root.
import React, { useCallback } from 'react';
import { useTheme } from '../../theme/AppearanceContext';
import { useNav } from '../../nav/NavContext';
import { useData } from '../../data/DataContext';
import { useTrailStatus } from '../../trail/TrailContext';
import { useClipboardProduct } from '../../hooks/useClipboardProduct';
import { ClipboardProductCard } from './ClipboardProductCard';
import { itemFromLinkPreview, providerLabel } from './gearRecognition';
import { GearLinkPreview } from '../../lib/gearLinkPreview';

export function ClipboardProductGate() {
  const theme = useTheme();
  const nav = useNav();
  const data = useData();
  const trailStatus = useTrailStatus();
  const { product, dismiss } = useClipboardProduct(() =>
    // Keep the card away from anything it would have to interrupt: an active
    // recording or navigation, and any full-screen overlay that is already up.
    // Being signed in is implicit — this gate only mounts inside the session tree.
    trailStatus != null || nav.blockingOverlayOpen,
  );

  const onAdd = useCallback((preview: GearLinkPreview) => {
    nav.openGearDraft({
      item: itemFromLinkPreview(preview, data.cats),
      source: { label: providerLabel(preview.provider), url: preview.sourceUrl },
    });
    dismiss();
  }, [data.cats, dismiss, nav]);

  return (
    <ClipboardProductCard
      theme={theme}
      preview={product?.preview ?? null}
      weightUnit={data.profile.gearWeightUnit || 'kg'}
      onAdd={onAdd}
      onClose={dismiss}
    />
  );
}
