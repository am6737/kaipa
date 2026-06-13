// GearItemDetail.tsx — 装备详情. Tap a gear item (装备 / 分类详情 / 套装详情) to
// drill in: a photo hero, a 规格 spec card, any 自定义属性, real 库内占比 share
// bars (this item's slice of its category and of the whole library, plus its
// weight rank), the 套装 it belongs to (tap to drill further), and 备注. The ···
// menu offers 编辑 / 删除, with delete confirmed through the shared action sheet.
import React from 'react';
import { View, Text } from 'react-native';
import { Theme } from '../../theme/theme';
import { MONO } from '../../theme/fonts';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { PhotoTile } from '../PhotoTile';
import { useNav } from '../../nav/NavContext';
import { useI18n } from '../../i18n';
import { GearItem, GearCat, GearSet } from '../../data/gear';
import { GearPushPage, GearCard, SectionLabel, ShareBar, KV, CircleBtn, yuan, fmtKg, toneFor } from './parts';

export function GearItemDetail({
  theme,
  item,
  cat,
  allItems,
  sets,
  onBack,
  onOpenSet,
  onDelete,
  onEdit,
}: {
  theme: Theme;
  item: GearItem;
  cat: GearCat;
  allItems: GearItem[];
  sets: GearSet[];
  onBack: () => void;
  onOpenSet: (s: GearSet) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const nav = useNav();
  const { t } = useI18n();
  const qty = item.qty || 1;
  const unitW = item.w;
  const unitP = item.p;
  const itemW = item.w * qty;
  const itemP = item.p * qty;

  // ── real library context ──────────────────────────────────────────────────
  const totalW = allItems.reduce((a, it) => a + it.w * (it.qty || 1), 0) || itemW;
  const totalP = allItems.reduce((a, it) => a + it.p * (it.qty || 1), 0) || itemP;
  const catItems = allItems.filter((it) => it.cat === item.cat);
  const catW = catItems.reduce((a, it) => a + it.w * (it.qty || 1), 0) || itemW;
  const wRank = catItems.slice().sort((a, b) => b.w * (b.qty || 1) - a.w * (a.qty || 1)).findIndex((it) => it.name === item.name) + 1;
  const memberSets = sets.filter((s) => s.items.includes(item.name));

  // ── 规格 rows ─────────────────────────────────────────────────────────────
  const specs: [string, string][] = [[t('gear.spec.qty'), '×' + qty], [t('gear.spec.totalWeight'), fmtKg(itemW)]];
  if (qty > 1) specs.push([t('gear.spec.unitWeight'), fmtKg(unitW)]);
  specs.push([t('gear.spec.value'), yuan(itemP)]);
  if (qty > 1) specs.push([t('gear.spec.unitValue'), yuan(unitP)]);

  const confirmDelete = () =>
    nav.openActionSheet({
      title: t('gear.itemDetail.deleteConfirmTitle', { name: item.name }),
      message: t('gear.itemDetail.deleteConfirmMessage'),
      items: [{ label: t('gear.itemDetail.deleteItem'), icon: 'trash', destructive: true, onPress: onDelete }],
    });
  const openMenu = () =>
    nav.openActionSheet({
      title: item.name,
      items: [
        { label: t('common.edit'), icon: 'edit', onPress: onEdit },
        { label: t('gear.itemDetail.deleteItem'), icon: 'trash', destructive: true, onPress: confirmDelete },
      ],
    });

  const hero = (
    <PhotoTile tone={toneFor(item.name)} seed={item.name} radius={0} resWidth={1000} darken style={{ width: '100%', height: 300 }}>
      <View style={{ position: 'absolute', left: 16, bottom: 14, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 9, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.42)' }}>
        <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: cat.color }} />
        <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#fff' }}>{cat.name}</Text>
      </View>
    </PhotoTile>
  );

  return (
    <GearPushPage theme={theme} onBack={onBack} hero={hero} right={<CircleBtn theme={theme} name="more" onPress={openMenu} />}>
      <View style={{ paddingHorizontal: 20 }}>
        {/* title */}
        <Text style={{ fontSize: 25, fontWeight: '700', color: theme.text, letterSpacing: -0.5, lineHeight: 31, marginTop: 8 }}>{item.name}</Text>

        {/* 规格 */}
        <SectionLabel theme={theme} text={t('gear.section.spec')} />
        <GearCard theme={theme}>
          <KV
            theme={theme}
            k={t('gear.spec.category')}
            first
            v={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: cat.color }} />
                <Text style={{ fontSize: 14.5, fontWeight: '600', color: theme.text }}>{cat.name}</Text>
              </View>
            }
          />
          {specs.map(([k, v]) => (
            <KV key={k} theme={theme} k={k} v={v} />
          ))}
        </GearCard>

        {/* 自定义属性 */}
        {item.attrs && item.attrs.length > 0 ? (
          <>
            <SectionLabel theme={theme} text={`${t('gear.section.customAttrs')} · ${item.attrs.length}`} />
            <GearCard theme={theme}>
              {item.attrs.map(([k, v], i) => (
                <KV key={k} theme={theme} k={k} v={v} leadingDot={theme.text3} first={i === 0} />
              ))}
            </GearCard>
          </>
        ) : null}

        {/* 库内占比 */}
        <SectionLabel theme={theme} text={t('gear.section.libraryShare')} />
        <GearCard theme={theme} style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
          <ShareBar theme={theme} label={t('gear.share.weightInCat')} pct={(itemW / catW) * 100} sub={`${cat.name} ${catItems.length} ${t('gear.unit.items')}`} color={cat.color} />
          <ShareBar theme={theme} label={t('gear.share.weightInAll')} pct={(itemW / totalW) * 100} sub={t('gear.share.subAllWeight', { value: totalW.toFixed(1) })} color={theme.text2} />
          <ShareBar theme={theme} label={t('gear.share.valueInAll')} pct={(itemP / totalP) * 100} sub={t('gear.share.subAllValue', { value: yuan(totalP) })} color={theme.text2} last />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6, paddingTop: 10, borderTopWidth: 0.5, borderColor: theme.hairline }}>
            <Text style={{ fontSize: 13, color: theme.text2 }}>{t('gear.share.weightRank')}</Text>
            <Text style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: '700', color: theme.text }}>{t('gear.share.rankValue', { rank: wRank, total: catItems.length })}</Text>
          </View>
        </GearCard>

        {/* 所属套装 */}
        <SectionLabel theme={theme} text={`${t('gear.section.memberSets')}${memberSets.length > 0 ? ' · ' + memberSets.length : ''}`} />
        {memberSets.length === 0 ? (
          <GearCard theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 15 }}>
            <Text style={{ fontSize: 13.5, color: theme.text3 }}>{t('gear.itemDetail.noMemberSets')}</Text>
          </GearCard>
        ) : (
          <GearCard theme={theme}>
            {memberSets.map((s, i) => {
              const its = s.items.map((n) => allItems.find((x) => x.name === n)).filter(Boolean) as GearItem[];
              const wt = its.reduce((a, x) => a + x.w * (x.qty || 1), 0);
              return (
                <React.Fragment key={s.id}>
                  {i > 0 && <View style={{ height: 0.5, backgroundColor: theme.hairline, marginLeft: 16 }} />}
                  <Press onPress={() => onOpenSet(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', color: theme.text, flexShrink: 1 }}>{s.name}</Text>
                    <Text style={{ fontFamily: MONO, fontSize: 11, color: theme.text2 }}>{its.length} {t('gear.unit.items')} · {wt.toFixed(1)} kg</Text>
                    <View style={{ marginLeft: 'auto' }}>
                      <Icon name="chevronR" color={theme.text3} size={14} />
                    </View>
                  </Press>
                </React.Fragment>
              );
            })}
          </GearCard>
        )}

        {/* 备注 */}
        <SectionLabel theme={theme} text={t('gear.section.note')} />
        <GearCard theme={theme} style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
          <Text style={{ fontSize: 14.5, lineHeight: 22, color: item.note ? theme.text : theme.text3 }}>
            {item.note || t('gear.itemDetail.notePlaceholder')}
          </Text>
        </GearCard>
      </View>
    </GearPushPage>
  );
}
