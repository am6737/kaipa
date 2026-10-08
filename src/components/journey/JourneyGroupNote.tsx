import { MAX_TIMELINE_GROUP_NOTE_LENGTH } from '../../data/timeline';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import type { Theme } from '../../theme/theme';
import { space, type } from '../../design-system';
import { useI18n } from '../../i18n';
import { isWriteBusy } from '../../lib/writeErrors';
import { Icon } from '../Icon';
import { Press } from '../Press';
import { NJBottomSheet } from '../overlays/NewJourneyParts';

export function JourneyGroupNote({ theme, label, note = '', onSave }: {
  theme: Theme; label: string; note?: string; onSave?: (note: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const close = () => { if (!savingRef.current) setOpen(false); };
  const save = async () => {
    if (!onSave || savingRef.current || draft.trim().length > MAX_TIMELINE_GROUP_NOTE_LENGTH) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave(draft);
      setOpen(false);
    } catch (error) {
      Alert.alert(
        t(isWriteBusy(error) ? 'journey.timeline.saveBusyTitle' : 'journey.timeline.groupNoteFailedTitle'),
        t(isWriteBusy(error) ? 'journey.timeline.saveBusyMessage' : 'journey.timeline.groupNoteFailedMessage'),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const openEditor = () => { setDraft(note); setOpen(true); };
  return <View style={{ flex: 1, minWidth: 0, marginLeft: space.sm }}>
    {note || onSave ? (
      <Press
        accessibilityRole="button"
        accessibilityLabel={note ? onSave ? `${t('journey.timeline.editGroupNote')}: ${note}` : note : t('journey.timeline.addGroupNote')}
        onPress={openEditor}
        style={{ minHeight: 36, justifyContent: 'center' }}
      >
        <Text numberOfLines={1} ellipsizeMode="tail" style={[type.body, { color: theme.text3, fontSize: 14, lineHeight: 24 }]}>
          {note ? note.replace(/\s*\n\s*/g, ' ') : t('journey.timeline.addGroupNote')}
        </Text>
      </Press>
    ) : null}
    {open ? <Modal transparent visible animationType="none" onRequestClose={close}>
      <NJBottomSheet
        theme={theme}
        onClose={close}
        keyboardAvoiding={!!onSave}
        fillBehindKeyboard={!!onSave}
        keyboardOverlap={0}
        bottomPadding={16}
        backgroundColor={theme.surfaceTop}
        borderless
        showGrabber={false}
        bodyScrolls
      >
        <View style={{ paddingHorizontal: 18, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: onSave ? 12 : 16 }}>
            <Text numberOfLines={2} style={{ flex: 1, color: theme.text, fontSize: 18, lineHeight: 25, fontWeight: '700' }}>
              {t(onSave ? note ? 'journey.timeline.editGroupNoteTitle' : 'journey.timeline.addGroupNoteTitle' : 'journey.timeline.groupNoteTitle', { name: label })}
            </Text>
            {!onSave ? <Press onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: theme.fieldSurface, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={15} color={theme.text2} />
            </Press> : null}
          </View>
          {onSave ? <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
              <TextInput
                autoFocus
                multiline
                editable={!saving}
                value={draft}
                onChangeText={setDraft}
                maxLength={Math.max(MAX_TIMELINE_GROUP_NOTE_LENGTH, note.length)}
                placeholder={t('journey.timeline.groupNotePlaceholder')}
                placeholderTextColor={theme.text3}
                accessibilityLabel={t('journey.timeline.groupNoteTitle', { name: label })}
                style={{ flex: 1, minHeight: 40, maxHeight: 144, padding: 0, paddingVertical: 8, color: theme.text, fontSize: 16.5, lineHeight: 24, fontWeight: '600', textAlignVertical: 'top' }}
              />
              <Press
                onPress={() => void save()}
                disabled={saving || draft.trim().length > MAX_TIMELINE_GROUP_NOTE_LENGTH}
                accessibilityRole="button"
                accessibilityLabel={t('journey.timeline.groupNoteConfirm')}
                accessibilityState={{ disabled: saving || draft.trim().length > MAX_TIMELINE_GROUP_NOTE_LENGTH, busy: saving }}
                style={{ minWidth: 64, height: 40, paddingHorizontal: 18, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent, opacity: draft.trim().length > MAX_TIMELINE_GROUP_NOTE_LENGTH ? 0.4 : 1 }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 14.5, fontWeight: '700' }}>{t('journey.timeline.groupNoteConfirm')}</Text>}
              </Press>
            </View>
            {draft.length >= 90 ? <Text style={[type.caption, { color: draft.trim().length > MAX_TIMELINE_GROUP_NOTE_LENGTH ? theme.danger : theme.text3, marginTop: 8 }]}>{draft.length}/100</Text> : null}
          </> : <ScrollView style={{ maxHeight: 220 }}><Text selectable style={[type.body, { color: theme.text2, lineHeight: 24 }]}>{note}</Text></ScrollView>}
        </View>
      </NJBottomSheet>
    </Modal> : null}
  </View>;
}
