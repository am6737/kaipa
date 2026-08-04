// ManageCompanions.tsx — 同行管理: full-screen roster CRUD for one journey,
// opened from the journey detail's 同行 card 「管理」. Faithful RN port of the
// prototype's companions-screen.jsx:
//   • the 发起人 (host / self) is pinned at the top, non-editable
//   • tap a companion row to edit (name + 分工), long-press to multi-select
//   • add via 邀请伙伴 (reuses the QR/链接 share panel) or 手动添加
//   • single delete (in the editor) + batch 移出所选 (select mode)
// Mutations flow back through onChange so the journey card's stat strip, avatar
// stack and 「X 人同行」 all update live (session-local, no backend).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme } from '../../theme/theme';
import { DEFAULT_JOURNEY_PARTICIPANT_PERMISSIONS, Poi, Companion, JourneyParticipantPermissions } from '../../data/pois';
import { ParticipantAvatar } from './ParticipantAvatar';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet, NJSharePanel } from './NewJourneySheet';
import { useI18n, TKey } from '../../i18n';
import { AppIconButton, DetailPage, radius, space, type } from '../../design-system';

// New companions cycle through this palette; 分工 quick-fills + the two roles
// that get the accent-coloured badge mirror the prototype.
const PALETTE = ['#FF5C3A', '#0A84FF', '#34C759', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF', '#5E5CE6'];
const PRESET_ROLES = ['领队', '向导', '医疗', '后勤', '摄影'];

// 2 letters for a latin name, 1 glyph for CJK; '友' as a last resort.
function iniOf(name: string): string {
  const n = (name || '').trim();
  if (!n) return '友';
  return n.slice(0, /[a-zA-Z]/.test(n[0]) ? 2 : 1);
}

// ── Add / edit bottom sheet ──────────────────────────────────────
function CompanionEditor({
  theme,
  draft,
  isNew,
  existingNames,
  onSave,
  onDelete,
  onClose,
}: {
  theme: Theme;
  draft: Companion;
  isNew: boolean;
  existingNames: string[];
  onSave: (c: Companion) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(draft.name || '');
  const [role, setRole] = useState(draft.role || '');
  const isDuplicate = name.trim().length > 0 && existingNames.includes(name.trim());
  const valid = name.trim().length > 0 && !isDuplicate;
  const color = draft.color || PALETTE[0];
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!isNew) return;
    const timer = setTimeout(() => nameRef.current?.focus(), 320);
    return () => clearTimeout(timer);
  }, [isNew]);

  const save = () => {
    if (!valid) return;
    onSave({ ...draft, name: name.trim(), role: role.trim(), ini: iniOf(name), color });
  };

  const fieldStyle = {
    height: 52,
    paddingHorizontal: space.md,
    paddingVertical: 0,
    textAlignVertical: 'center' as const,
    borderRadius: radius.control,
    backgroundColor: theme.fieldSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.fieldBorder,
    fontSize: 16,
    color: theme.text,
  } as const;

  return (
    <NJBottomSheet theme={theme} onClose={onClose} full keyboardAvoiding fillBehindKeyboard bottomPadding={space.xs} keyboardOverlap={space.xs} backgroundColor={theme.featureSurface}>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.sm }}>
        <View style={{ paddingTop: space.sm, marginBottom: space.xl }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>
            {isNew ? t('journey.manage.addParticipant') : t('journey.manage.editParticipant')}
          </Text>
        </View>

        <Text style={[type.eyebrow, { color: theme.text3, marginBottom: space.xs }]}>{t('journey.manage.nameLabel')}</Text>
        <TextInput
          ref={nameRef}
          value={name}
          onChangeText={setName}
          placeholder={t('journey.manage.namePlaceholder')}
          placeholderTextColor={theme.text3}
          maxLength={24}
          returnKeyType="next"
          style={[fieldStyle, isDuplicate && { borderColor: theme.danger }]}
        />
        {isDuplicate ? (
          <Text style={[type.caption, { color: theme.danger, marginTop: space.xs }]}>{t('journey.manage.nameDuplicate')}</Text>
        ) : null}

        <Text style={[type.eyebrow, { color: theme.text3, marginTop: space.xl, marginBottom: space.xs }]}>{t('journey.manage.roleLabel')}</Text>
        <TextInput
          value={role}
          onChangeText={setRole}
          placeholder={t('journey.manage.rolePlaceholder')}
          placeholderTextColor={theme.text3}
          maxLength={12}
          returnKeyType="done"
          onSubmitEditing={save}
          style={fieldStyle}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.sm }}>
          {PRESET_ROLES.map((preset) => {
            const selectedRole = preset === role.trim();
            return (
              <Press
                key={preset}
                onPress={() => setRole(selectedRole ? '' : preset)}
                style={{
                  height: 32,
                  paddingHorizontal: space.sm,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selectedRole ? theme.accent : theme.controlSurface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: selectedRole ? theme.accent : theme.fieldBorder,
                }}
              >
                <Text style={[type.caption, { color: selectedRole ? '#FFFFFF' : theme.text2, fontWeight: '700' }]}>
                  {t(`journey.roles.${preset}` as TKey)}
                </Text>
              </Press>
            );
          })}
        </View>

        <Press
          onPress={save}
          disabled={!valid}
          accessibilityRole="button"
          style={{
            height: 50,
            marginTop: space.xxl,
            borderRadius: radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: valid ? theme.accent : theme.fieldSurface,
          }}
        >
          <Text style={[type.body, { color: valid ? '#FFFFFF' : theme.text3, fontWeight: '700' }]}>
            {isNew ? t('journey.manage.addParticipant') : t('common.save')}
          </Text>
        </Press>

        {!isNew ? (
          <Press onPress={onDelete} style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: space.lg }}>
            <Text style={[type.body, { color: theme.danger, fontWeight: '600' }]}>{t('journey.manage.removeParticipant')}</Text>
          </Press>
        ) : null}
      </View>
    </NJBottomSheet>
  );
}

// ── Add participant: invite or keep a manual record ─────────────
function AddChooser({ theme, onInvite, onManual, onClose }: { theme: Theme; onInvite: () => void; onManual: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const options = [
    { icon: 'people' as const, title: t('journey.manage.inviteTitle'), sub: t('journey.manage.inviteSub'), onPress: onInvite },
    { icon: 'user' as const, title: t('journey.manage.manualTitle'), sub: t('journey.manage.manualSub'), onPress: onManual },
  ];

  return (
    <NJBottomSheet theme={theme} onClose={onClose} full backgroundColor={theme.featureSurface}>
      <View style={{ paddingHorizontal: space.xl, paddingBottom: space.md }}>
        <View style={{ paddingTop: space.sm, marginBottom: space.md }}>
          <Text style={[type.sectionTitle, { color: theme.text }]}>{t('journey.manage.addParticipant')}</Text>
        </View>

        {options.map((option, index) => (
          <React.Fragment key={option.title}>
            {index > 0 ? <View style={{ height: space.xs }} /> : null}
            <Press
              onPress={option.onPress}
              style={{ minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}
            >
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={option.icon} color={theme.text2} size={18} />
              </View>
              <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
                <Text style={[type.cardTitle, { color: theme.text }]}>{option.title}</Text>
                <Text style={[type.caption, { color: theme.text3, lineHeight: 17, marginTop: space.xxs }]}>{option.sub}</Text>
              </View>
              <Icon name="chevronR" color={theme.text3} size={15} />
            </Press>
          </React.Fragment>
        ))}
      </View>
    </NJBottomSheet>
  );
}

// ── Main full-screen roster ──────────────────────────────────────
export function ManageCompanions({
  theme,
  poi,
  initialAction,
  onChange,
  onPermissionsChange,
  onClose,
  onToast,
}: {
  theme: Theme;
  poi: Poi;
  initialAction?: 'invite';
  onChange: (list: Companion[]) => void;
  onPermissionsChange: (permissions: JourneyParticipantPermissions) => void;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  // Split the roster: the 发起人 (self, else host) anchors the top and can't be
  // edited or removed; everyone else is the editable list.
  const { anchor, initialOthers } = useMemo(() => {
    const cl = poi.companionList || [];
    let ai = cl.findIndex((c) => c.self);
    if (ai < 0) ai = cl.findIndex((c) => c.host);
    if (ai < 0) return { anchor: null as Companion | null, initialOthers: cl };
    return { anchor: cl[ai], initialOthers: cl.filter((_, i) => i !== ai) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi.id]);

  const [others, setOthers] = useState<Companion[]>(initialOthers);
  const [editor, setEditor] = useState<{ index: number; isNew: boolean; draft: Companion } | null>(null);
  const [addMode, setAddMode] = useState<null | 'choose' | 'invite'>(initialAction || null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissions, setPermissions] = useState<JourneyParticipantPermissions>(() => ({
    ...DEFAULT_JOURNEY_PARTICIPANT_PERMISSIONS,
    ...(poi.participantPermissions || {}),
  }));

  const total = others.length + (anchor ? 1 : 0);

  const updatePermission = (key: keyof JourneyParticipantPermissions, value: boolean) => {
    const next = { ...permissions, [key]: value };
    setPermissions(next);
    onPermissionsChange(next);
  };

  const persist = (next: Companion[]) => {
    setOthers(next);
    onChange(anchor ? [anchor, ...next] : next);
  };


  // CRUD
  const openAdd = () => setEditor({ index: -1, isNew: true, draft: { ini: '友', name: '', role: '', color: PALETTE[others.length % PALETTE.length], trips: 0 } });
  const openEdit = (i: number) => setEditor({ index: i, isNew: false, draft: { ...others[i] } });
  const saveFrom = (next: Companion) => {
    if (!editor) return;
    persist(editor.isNew ? [...others, next] : others.map((c, i) => (i === editor.index ? next : c)));
    setEditor(null);
  };
  const deleteFrom = () => {
    if (!editor) return;
    persist(others.filter((_, i) => i !== editor.index));
    setEditor(null);
  };

  // multi-select (entered via long-press)
  const enterSelect = (i: number) => {
    setSelectMode(true);
    setSelected(new Set([i]));
  };
  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };
  const toggle = (i: number) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const allSelected = others.length > 0 && selected.size === others.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(others.map((_, index) => index)));
  const deleteSelected = () => {
    persist(others.filter((_, i) => !selected.has(i)));
    exitSelect();
  };



  const MemberBadge = ({ label, accent = false }: { label: string; accent?: boolean }) => (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: accent ? theme.accentSoft : theme.fieldSurface }}>
      <Text style={{ fontSize: 9.5, lineHeight: 12, fontWeight: '700', color: accent ? theme.accent : theme.text2 }}>{label}</Text>
    </View>
  );

  const participantRow = (c: Companion, i: number) => {
    const sel = selected.has(i);
    return (
      <Press
        key={`${c.name}-${i}`}
        onPress={() => (selectMode ? toggle(i) : openEdit(i))}
        onLongPress={() => {
          if (!selectMode) enterSelect(i);
        }}
        delayLongPress={380}
        style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm }}
      >
        <View style={{ width: 44, height: 44 }}>
          <ParticipantAvatar
            theme={theme}
            uri={c.avatarUrl}
            size={44}
            ring={selectMode && sel}
            ringColor={theme.accent}
          />
          {selectMode ? (
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: theme.featureSurface,
                backgroundColor: sel ? theme.accent : theme.controlSurface,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {sel ? <Icon name="check" color="#FFFFFF" size={10} strokeWidth={3} /> : null}
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
          <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text }]}>{c.name}</Text>
          <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>
            {c.role || t('journey.manage.participantRole')}
          </Text>
        </View>
      </Press>
    );
  };

  const permissionRows = (
    <View>
      {([
        ['editTimeline', 'journey.manage.permissionEditTimeline', 'journey.manage.permissionEditTimelineSub'],
        ['addMoments', 'journey.manage.permissionAddMoments', 'journey.manage.permissionAddMomentsSub'],
        ['editChecklist', 'journey.manage.permissionEditChecklist', 'journey.manage.permissionEditChecklistSub'],
        ['checkChecklistItems', 'journey.manage.permissionCheckChecklist', 'journey.manage.permissionCheckChecklistSub'],
        ['inviteParticipants', 'journey.manage.permissionInvite', 'journey.manage.permissionInviteSub'],
      ] as const).map(([key, titleKey, subKey], index) => (
        <React.Fragment key={key}>
          {index > 0 ? <View style={{ height: StyleSheet.hairlineWidth, marginLeft: 0, backgroundColor: theme.hairline }} /> : null}
          <View style={{ minHeight: 76, paddingVertical: space.sm, flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{t(titleKey)}</Text>
              <Text style={[type.caption, { color: theme.text3, lineHeight: 17, marginTop: space.xxs }]}>{t(subKey)}</Text>
            </View>
            <Switch
              value={permissions[key]}
              onValueChange={(value) => updatePermission(key, value)}
              trackColor={{ false: theme.progressTrack, true: theme.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={theme.progressTrack}
            />
          </View>
        </React.Fragment>
      ))}
    </View>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.featureSurface, zIndex: 155 }]}>
      <DetailPage
        theme={theme}
        title={t('journey.manage.pageTitle')}
        onBack={selectMode ? exitSelect : onClose}
        backgroundColor={theme.featureSurface}
        right={
          selectMode ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <AppIconButton theme={theme} name="checkAll" onPress={toggleAll} active={allSelected} softShadow size={44} />
              <AppIconButton theme={theme} name="close" onPress={exitSelect} softShadow size={44} />
            </View>
          ) : (
            <AppIconButton theme={theme} name="plus" onPress={() => setAddMode('choose')} softShadow size={44} />
          )
        }
        overlay={
          selectMode && selected.size ? (
            <View style={{ position: 'absolute', right: space.md, bottom: Math.max(insets.bottom, space.md), zIndex: 20, alignItems: 'flex-end' }}>
              <Press
                onPress={deleteSelected}
                style={{
                  height: 52,
                  paddingHorizontal: space.lg,
                  borderRadius: radius.pill,
                  backgroundColor: theme.danger,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: space.sm,
                  boxShadow: theme.dark ? '0px 6px 18px rgba(0,0,0,0.42)' : '0px 6px 18px rgba(0,0,0,0.12)',
                }}
              >
                <Icon name="trash" color="#FFFFFF" size={21} strokeWidth={2} />
                <Text style={[type.body, { color: '#FFFFFF', fontWeight: '700' }]}>
                  {t('journey.manage.removeSelected', { count: selected.size })}
                </Text>
              </Press>
            </View>
          ) : undefined
        }
      >
        <View style={{ paddingHorizontal: space.xl, paddingTop: space.lg }}>
          <View style={{ paddingTop: space.sm }}>
            {anchor ? (
              <View style={{ minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingVertical: space.sm, opacity: selectMode ? 0.45 : 1 }}>
                <ParticipantAvatar theme={theme} uri={anchor.avatarUrl} size={44} />
                <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs }}>
                    <Text numberOfLines={1} style={[type.cardTitle, { color: theme.text, flexShrink: 1 }]}>{anchor.name}</Text>
                    {anchor.self ? <MemberBadge label={t('journey.companions.meBadge')} /> : null}
                    {anchor.host ? <MemberBadge label={t('journey.companions.host')} accent /> : null}
                  </View>
                  {anchor.role ? (
                    <Text numberOfLines={1} style={[type.caption, { color: theme.text3, marginTop: space.xxs }]}>{anchor.role}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            {others.map((c, i) => (
              <React.Fragment key={`${c.name}-${i}`}>
                {participantRow(c, i)}
              </React.Fragment>
            ))}
          </View>

          {others.length === 0 ? (
            <View style={{ alignItems: 'flex-start', paddingTop: space.xl, paddingBottom: space.xs }}>
              <Text style={[type.body, { color: theme.text2 }]}>{t('journey.manage.emptyClean')}</Text>
              <Press
                onPress={() => setAddMode('choose')}
                style={{ marginTop: space.md, height: 38, paddingHorizontal: space.md, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: space.xs, backgroundColor: theme.controlSurface }}
              >
                <Icon name="plus" color={theme.text} size={15} />
                <Text style={[type.body, { color: theme.text, fontWeight: '600' }]}>{t('journey.manage.inviteParticipant')}</Text>
              </Press>
            </View>
          ) : null}

          <Press
            onPress={() => setPermissionsOpen(true)}
            accessibilityRole="button"
            style={{ marginTop: space.xxxl }}
          >
            <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.body, { flex: 1, color: theme.text, fontWeight: '600' }]}>{t('journey.manage.permissionsTitle')}</Text>
              <Text style={[type.caption, { color: theme.text3, marginRight: space.xs }]}>
                {t('journey.manage.permissionsEnabled', { count: Object.values(permissions).filter(Boolean).length })}
              </Text>
              <Icon name="chevronR" color={theme.text3} size={15} />
            </View>
          </Press>
        </View>
      </DetailPage>

      {permissionsOpen ? (
        <View style={[StyleSheet.absoluteFill, { zIndex: 70, backgroundColor: theme.featureSurface }]}>
          <DetailPage
            theme={theme}
            title={t('journey.manage.permissionsTitle')}
            onBack={() => setPermissionsOpen(false)}
            backgroundColor={theme.featureSurface}
            flatChrome
          >
            <View style={{ paddingHorizontal: space.xl, paddingTop: space.xs }}>
              {permissionRows}
            </View>
          </DetailPage>
        </View>
      ) : null}

      {/* Layered sheets */}
      {editor && <CompanionEditor theme={theme} draft={editor.draft} isNew={editor.isNew} existingNames={[...(anchor ? [anchor.name] : []), ...others.filter((_, i) => i !== editor.index).map((c) => c.name)]} onSave={saveFrom} onDelete={deleteFrom} onClose={() => setEditor(null)} />}
      {addMode === 'choose' && (
        <AddChooser
          theme={theme}
          onInvite={() => setAddMode('invite')}
          onManual={() => {
            setAddMode(null);
            openAdd();
          }}
          onClose={() => setAddMode(null)}
        />
      )}
      {addMode === 'invite' && <NJSharePanel theme={theme} tripName={poi.name} journeyId={poi.id} onClose={() => setAddMode(null)} onToast={onToast} backgroundColor={theme.featureSurface} />}
    </View>
  );
}
