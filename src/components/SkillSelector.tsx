import { Plus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { SKILL_OPTIONS } from '@/lib/format';

export function SkillSelector({
  value,
  onChange,
  max = 15,
}: {
  value: string[];
  onChange: (skills: string[]) => void;
  max?: number;
}) {
  const [custom, setCustom] = useState('');
  const selected = new Set(value.map((s) => s.toLowerCase()));
  const options = [...new Set([...SKILL_OPTIONS, ...value])];

  const toggle = (skill: string) => {
    if (selected.has(skill.toLowerCase())) {
      onChange(value.filter((s) => s.toLowerCase() !== skill.toLowerCase()));
    } else if (value.length < max) {
      onChange([...value, skill]);
    }
  };

  const addCustom = () => {
    const skill = custom.trim();
    if (skill && !selected.has(skill.toLowerCase()) && value.length < max) {
      onChange([...value, skill]);
    }
    setCustom('');
  };

  return (
    <View>
      <View className="flex-row flex-wrap">
        {options.map((skill) => {
          const on = selected.has(skill.toLowerCase());
          return (
            <Pressable
              key={skill}
              onPress={() => toggle(skill)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              className={`mb-2 mr-2 flex-row items-center rounded-full border px-3.5 py-2 ${
                on ? 'border-brand bg-brand' : 'border-gray-200 bg-white'
              }`}
            >
              <Text className={`text-sm font-medium ${on ? 'text-white' : 'text-gray-700'}`}>
                {skill}
              </Text>
              {on ? <X size={14} color="#fff" style={{ marginLeft: 4 }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View className="mt-2 flex-row items-center">
        <TextInput
          value={custom}
          onChangeText={setCustom}
          onSubmitEditing={addCustom}
          placeholder="Add another skill"
          placeholderTextColor="#9CA3AF"
          returnKeyType="done"
          className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-4 text-base"
        />
        <Pressable
          onPress={addCustom}
          accessibilityLabel="Add skill"
          className="ml-2 h-11 w-11 items-center justify-center rounded-xl bg-brand"
        >
          <Plus size={20} color="#fff" />
        </Pressable>
      </View>
      <Text className="mt-2 text-xs text-gray-400">
        {value.length}/{max} selected
      </Text>
    </View>
  );
}
