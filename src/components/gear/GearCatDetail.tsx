// GearCatDetail.tsx — 分类详情. Tap a category (分类 tab) to list every piece of
// gear filed under it (heaviest first) with a per-category weight/value summary.
// Tap a row to drill into the item. The ··· menu offers 编辑 / 删除分类 — delete is
// only allowed for a custom, empty category (built-ins and non-empty ones keep
// their gear), matching the prototype's rule.
import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, itemWeight, itemPrice, WeightUnit, fmtWeight } from '../../data/gear';
import { GearPushPage, GearCard, SectionLabel, GearItemRow, CircleBtn, yuan } from './parts';

function GearCatDetailView({
  theme,
  cat,
  allItems,
  weightUnit = 'kg',
  onBack,
  onOpenItem,
  onDelete,
  onEdit,
}: {
  theme: Theme;
  cat: GearCat;
  allItems: GearItem[];
  weightUnit?: WeightUnit;
  onBack: () => void;
  onOpenItem: (it: GearItem) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const items = allItems
    .filter((it) => it.cat === cat.id)
    .slice()
    .sort((a, b) => itemWeight(b) - itemWeight(a));
  const totW = items.reduce((a, it) => a + itemWeight(it), 0);
  const totP = items.reduce((a, it) => a + itemPrice(it), 0);
  const confirmDelete = () =>
    nav.openActionSheet({
      title: t('gear.catDetail.deleteConfirmTitle', { name: cat.name }),
      message: items.length > 0 ? t('gear.category.deleteMessage', { count: items.length }) : t('gear.catDetail.deleteConfirmMessage'),
      items: [{ label: t('gear.catDetail.deleteCat'), icon: 'trash', destructive: true, onPress: onDelete }],
    });
  const openMenu = () =>
    nav.openActionSheet({
      title: cat.name,
      items: [
        { label: t('gear.catDetail.editCat'), icon: 'edit', onPress: onEdit },
        { label: t('gear.catDetail.deleteCat'), icon: 'trash', destructive: true, onPress: confirmDelete },
      ],
    });

  return (
    <GearPushPage theme={theme} onBack={onBack} right={<CircleBtn theme={theme} name="more" onPress={openMenu} />}>
      <View style={{ paddingHorizontal: 20 }}>
        {/* header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 4 }}>
          <View style={{ width: 13, height: 13, borderRadius: 4, backgroundColor: cat.color }} />
          <Text style={{ fontSize: 27, fontWeight: '800', color: theme.text, letterSpacing: -0.6, flexShrink: 1 }} numberOfLines={2}>{cat.name}</Text>
        </View>
        {items.length > 0 ? (
          <Text style={{ fontFamily: MONO, fontSize: 11.5, color: theme.text2, marginTop: 7 }}>{fmtWeight(totW, weightUnit)} · {yuan(totP)}</Text>
        ) : null}

        {/* 装备清单 */}
        <SectionLabel theme={theme} text={`${t('gear.section.itemList')} · ${items.length}`} />
        {items.length === 0 ? (
          <GearCard theme={theme} style={{ paddingVertical: 26, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text2, textAlign: 'center' }}>{t('gear.catDetail.emptyTitle')}</Text>
            <Text style={{ fontSize: 12.5, color: theme.text3, textAlign: 'center', marginTop: 5 }}>{t('gear.catDetail.emptyBody')}</Text>
          </GearCard>
        ) : (
          <GearCard theme={theme}>
            {items.map((it, i) => (
              <GearItemRow key={it.name} theme={theme} item={it} last={i === items.length - 1} onPress={() => onOpenItem(it)} weightUnit={weightUnit} />
            ))}
          </GearCard>
        )}
      </View>
    </GearPushPage>
  );
}

export const GearCatDetail = React.memo(GearCatDetailView, (previous, next) => (
  previous.theme === next.theme
  && previous.cat === next.cat
  && previous.allItems === next.allItems
  && previous.weightUnit === next.weightUnit
));
