/**
 * EnrollmentFormScreen — Fill in user details after face capture.
 */

import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';
import {COLORS} from '../utils/constants';
import {insertUser} from '../services/DatabaseService';
import {addToCache} from '../services/FaceRecognitionService';
import {logger} from '../utils/logger';
import type {RootStackParamList} from '../types';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EnrollmentForm'>;
  route: RouteProp<RootStackParamList, 'EnrollmentForm'>;
}

const DEPARTMENTS = ['Engineering', 'Construction', 'Safety', 'Admin', 'Finance', 'IT'];

export const EnrollmentFormScreen: React.FC<Props> = ({navigation, route}) => {
  const {embedding} = route.params;

  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');
  const [designation, setDesignation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = 'Name is required';
    if (!employeeId.trim()) newErrors.employeeId = 'Employee ID is required';
    else if (!/^[A-Z0-9-]{4,12}$/i.test(employeeId.trim())) {
      newErrors.employeeId = 'Invalid ID format (4-12 alphanumeric)';
    }
    if (!department) newErrors.department = 'Department is required';
    if (!designation.trim()) newErrors.designation = 'Designation is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setIsSubmitting(true);

    try {
      const user = await insertUser({
        name: name.trim(),
        employeeId: employeeId.trim().toUpperCase(),
        department,
        designation: designation.trim(),
        embedding,
        enrolledAt: Date.now(),
      });

      // Update in-memory cache immediately
      addToCache(user.id, embedding);

      logger.info('EnrollmentForm', `User enrolled: ${user.name} (${user.employeeId})`);

      Alert.alert(
        '✅ Enrollment Successful',
        `${user.name} has been enrolled successfully.\nEmployee ID: ${user.employeeId}`,
        [
          {
            text: 'Done',
            onPress: () => navigation.popToTop(),
          },
        ],
      );
    } catch (err: any) {
      const message = String(err).includes('UNIQUE')
        ? 'Employee ID already exists. Please use a different ID.'
        : 'Enrollment failed. Please try again.';
      Alert.alert('Enrollment Failed', message);
      logger.error('EnrollmentForm', 'Enrollment error', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerEmoji}>👤</Text>
            <Text style={styles.headerTitle}>Complete Registration</Text>
            <Text style={styles.headerSubtitle}>
              Face captured successfully! Fill in the details below.
            </Text>
          </View>

          {/* Success indicator */}
          <View style={styles.successBadge}>
            <Text style={styles.successText}>✅ Face data captured and processed</Text>
          </View>

          {/* Form Fields */}
          <View style={styles.form}>
            <Field
              label="Full Name *"
              placeholder="e.g. Rajesh Kumar"
              value={name}
              onChangeText={setName}
              error={errors.name}
              autoCapitalize="words"
            />
            <Field
              label="Employee ID *"
              placeholder="e.g. NHAI2024001"
              value={employeeId}
              onChangeText={setEmployeeId}
              error={errors.employeeId}
              autoCapitalize="characters"
            />
            <Field
              label="Designation *"
              placeholder="e.g. Site Engineer"
              value={designation}
              onChangeText={setDesignation}
              error={errors.designation}
              autoCapitalize="words"
            />

            {/* Department Picker */}
            <Text style={styles.fieldLabel}>Department *</Text>
            <View style={styles.deptGrid}>
              {DEPARTMENTS.map(dept => (
                <TouchableOpacity
                  key={dept}
                  style={[styles.deptChip, department === dept && styles.deptChipSelected]}
                  onPress={() => setDepartment(dept)}>
                  <Text
                    style={[
                      styles.deptChipText,
                      department === dept && styles.deptChipTextSelected,
                    ]}>
                    {dept}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {errors.department && (
              <Text style={styles.errorText}>{errors.department}</Text>
            )}
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
            activeOpacity={0.85}>
            {isSubmitting ? (
              <ActivityIndicator color={COLORS.text} />
            ) : (
              <Text style={styles.submitBtnText}>Complete Enrollment →</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ── Helper Component ────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}

const Field: React.FC<FieldProps> = ({label, placeholder, value, onChangeText, error, autoCapitalize}) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, error && styles.inputError]}
      placeholder={placeholder}
      placeholderTextColor={COLORS.textMuted}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize={autoCapitalize}
    />
    {error && <Text style={styles.errorText}>{error}</Text>}
  </View>
);

const styles = StyleSheet.create({
  flex: {flex: 1},
  container: {flex: 1, backgroundColor: COLORS.background},
  scroll: {padding: 24, paddingBottom: 60},
  header: {alignItems: 'center', marginBottom: 20},
  headerEmoji: {fontSize: 44, marginBottom: 12},
  headerTitle: {color: COLORS.text, fontSize: 22, fontWeight: '700'},
  headerSubtitle: {color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6},
  successBadge: {
    backgroundColor: `${COLORS.success}22`,
    borderColor: COLORS.success,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 24,
  },
  successText: {color: COLORS.success, fontSize: 13, fontWeight: '600'},
  form: {gap: 16, marginBottom: 28},
  fieldContainer: {},
  fieldLabel: {color: COLORS.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5},
  input: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: COLORS.text,
    fontSize: 15,
  },
  inputError: {borderColor: COLORS.error},
  errorText: {color: COLORS.error, fontSize: 12, marginTop: 4},
  deptGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4},
  deptChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  deptChipSelected: {backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight},
  deptChipText: {color: COLORS.textSecondary, fontSize: 13, fontWeight: '500'},
  deptChipTextSelected: {color: COLORS.text, fontWeight: '600'},
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: {opacity: 0.6},
  submitBtnText: {color: COLORS.text, fontSize: 16, fontWeight: '700', letterSpacing: 0.5},
});
