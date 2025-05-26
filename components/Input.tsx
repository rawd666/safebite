import { TextInput, View, TextInputProps } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Colors } from '@/constants/Colors';

type InputProps = TextInputProps & {
  label?: string;
  error?: string;
};

export default function Input({ label, error, ...props }: InputProps) {
  return (
    <View className="mb-4">
      {label && (
        <ThemedText className="mb-2 text-sm text-textSecondary">
          {label}
        </ThemedText>
      )}
      <TextInput
        placeholderTextColor={Colors.textSecondary}
        className={`bg-gray-100 p-4 rounded-lg ${
          error ? 'border border-error' : ''
        }`}
        {...props}
      />
      {error && (
        <ThemedText className="mt-1 text-error text-sm">{error}</ThemedText>
      )}
    </View>
  );
}