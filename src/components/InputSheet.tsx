import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { COLORS, FONTS, RADII } from '../constants/theme';

interface Props {
  visible: boolean;
  title: string;
  submitLabel: string;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}

export default function InputSheet({ visible, title, submitLabel, onClose, onSubmit, children }: Props) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grip} />
          <Text style={styles.title}>{title}</Text>
          <View style={styles.body}>{children}</View>
          <TouchableOpacity style={styles.submit} onPress={onSubmit}>
            <Text style={styles.submitText}>{submitLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancel} onPress={onClose} hitSlop={8}>
            <Text style={styles.cancelText}>×</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28,22,30,0.42)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.paper,
    borderTopLeftRadius: RADII.sheet,
    borderTopRightRadius: RADII.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 34,
  },
  grip: { width: 38, height: 4, borderRadius: 4, backgroundColor: COLORS.line, alignSelf: 'center', marginBottom: 16 },
  title: { fontFamily: FONTS.serifKo, color: COLORS.ink, fontSize: 20, textAlign: 'center', marginBottom: 18 },
  body: { gap: 14 },
  submit: { backgroundColor: COLORS.ember, borderRadius: RADII.btn, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  submitText: { color: COLORS.emberText, fontSize: 15, fontWeight: '600' },
  cancel: { position: 'absolute', top: 14, right: 18, padding: 6 },
  cancelText: { color: COLORS.ink3, fontSize: 22, lineHeight: 22 },
});
