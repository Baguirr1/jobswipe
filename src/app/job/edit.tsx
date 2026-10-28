import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';

import { SkillSelector } from '@/components/SkillSelector';
import { Button, Field } from '@/components/ui';
import { getJob, upsertJob, type JobInput } from '@/lib/api';
import { embedJob } from '@/lib/embeddings';
import { useAuth } from '@/providers/AuthProvider';

const EMPTY: JobInput = {
  title: '',
  company_name: '',
  company_logo: null,
  description: '',
  location: null,
  is_remote: false,
  salary_min: null,
  salary_max: null,
  required_skills: [],
  is_active: true,
};

const toInt = (s: string) => {
  const n = parseInt(s.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};

export default function EditJobScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile } = useAuth();
  const [form, setForm] = useState<JobInput>(EMPTY);
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    getJob(id)
      .then(({ id: _id, recruiter_id: _r, created_at: _c, ...rest }) => setForm(rest))
      .catch((e) => Alert.alert('Could not load job', e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const set = <K extends keyof JobInput>(key: K, value: JobInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    if (!profile) return;
    if (!form.title.trim() || !form.company_name.trim()) {
      return Alert.alert('Missing details', 'A job needs a title and company name.');
    }
    if (form.salary_min != null && form.salary_max != null && form.salary_min > form.salary_max) {
      return Alert.alert('Check salary', 'Minimum salary is higher than maximum.');
    }
    setSaving(true);
    try {
      const saved = await upsertJob(profile.id, {
        ...form,
        title: form.title.trim(),
        company_name: form.company_name.trim(),
        company_logo: form.company_logo?.trim() || null,
        location: form.location?.trim() || null,
      }, id);
      try {
        await embedJob(saved.id);
      } catch (e) {
        console.warn('Job embedding failed', e);
        Alert.alert(
          'Job saved',
          "AI matching isn't ready for this listing yet; it will still appear in feeds, ranked lower.",
        );
      }
      router.back();
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator className="mt-10" color="#6C47FF" />;

  return (
    <KeyboardAvoidingView className="flex-1 bg-gray-50" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerClassName="p-6 pb-12" keyboardShouldPersistTaps="handled">
        <Field label="Job title" value={form.title} onChangeText={(v) => set('title', v)} />
        <Field label="Company" value={form.company_name} onChangeText={(v) => set('company_name', v)} />
        <Field
          label="Logo URL (optional)"
          value={form.company_logo ?? ''}
          onChangeText={(v) => set('company_logo', v)}
          autoCapitalize="none"
          keyboardType="url"
        />
        <View className="mb-4 flex-row items-center justify-between rounded-xl bg-white px-4 py-3">
          <Text className="text-base text-gray-800">Remote role</Text>
          <Switch value={form.is_remote} onValueChange={(v) => set('is_remote', v)} trackColor={{ true: '#6C47FF' }} />
        </View>
        <Field
          label="Location"
          placeholder={form.is_remote ? 'Optional, e.g. US time zones' : 'e.g. Charlotte, NC'}
          value={form.location ?? ''}
          onChangeText={(v) => set('location', v)}
        />
        <View className="flex-row">
          <View className="mr-2 flex-1">
            <Field
              label="Salary min ($)"
              keyboardType="number-pad"
              value={form.salary_min?.toString() ?? ''}
              onChangeText={(v) => set('salary_min', toInt(v))}
            />
          </View>
          <View className="ml-2 flex-1">
            <Field
              label="Salary max ($)"
              keyboardType="number-pad"
              value={form.salary_max?.toString() ?? ''}
              onChangeText={(v) => set('salary_max', toInt(v))}
            />
          </View>
        </View>
        <Text className="mb-3 text-sm font-medium text-gray-700">Required skills</Text>
        <View className="mb-6">
          <SkillSelector value={form.required_skills} onChange={(v) => set('required_skills', v)} />
        </View>
        <Field
          label="Description & responsibilities"
          value={form.description}
          onChangeText={(v) => set('description', v)}
          multiline
        />
        <View className="mb-6 flex-row items-center justify-between rounded-xl bg-white px-4 py-3">
          <Text className="text-base text-gray-800">Listing active</Text>
          <Switch value={form.is_active} onValueChange={(v) => set('is_active', v)} trackColor={{ true: '#6C47FF' }} />
        </View>
        <Button title={id ? 'Save changes' : 'Publish job'} onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
