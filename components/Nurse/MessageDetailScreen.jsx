import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';

export default function MessageDetailScreen() {
  const route = useRoute();
  const { conversation } = route.params;

  const [messages, setMessages] = useState([
    {
      id: '1',
      text: 'Hello, how are you feeling today?',
      sender: 'other',
    },
    {
      id: '2',
      text: 'I am feeling much better, thank you!',
      sender: 'me',
    },
  ]);

  const [input, setInput] = useState('');

  const sendMessage = () => {
    if (input.trim() === '') return;

    const newMessage = {
      id: Date.now().toString(),
      text: input,
      sender: 'me',
    };

    setMessages([...messages, newMessage]);
    setInput('');
  };

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === 'me'
          ? styles.myMessage
          : styles.otherMessage,
      ]}
    >
      <Text style={{ color: item.sender === 'me' ? '#fff' : '#000' }}>
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={styles.header}>{conversation.name}</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        content
                contentContainerStyle={{ padding: 15 }}
      />

      {/* Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={input}
            onChangeText={setInput}
          />

          <TouchableOpacity
            style={styles.sendButton}
            onPress={sendMessage}
          >
            <Text style={{ color: '#fff', fontWeight: 'bold' }}>
              Send
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    color: '#d9802b',
  },

  messageBubble: {
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    maxWidth: '75%',
  },

  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#d9802b',
  },

  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f1f1f1',
  },

  inputContainer: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#fff',
  },

  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    marginRight: 10,
  },

  sendButton: {
    backgroundColor: '#d9802b',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
});
