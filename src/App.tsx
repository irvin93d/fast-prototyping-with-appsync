import logo from "./logo.svg";
import Observable from "zen-observable-ts";
import "./App.css";

import { Amplify, API, graphqlOperation } from "aws-amplify";
import config from "./aws-exports";
import { useCallback, useEffect, useState } from "react";
import {
  CreateMessageInput,
  CreateMessageMutation,
  Message,
  MessagesByDateQuery,
  MessagesByDateQueryVariables,
  MessageType,
  ModelSortDirection,
  OnCreateMessageSubscription,
} from "./API";
import { messagesByDate } from "./graphql/queries";
import { GraphQLResult } from "@aws-amplify/api-graphql";
import { createMessage } from "./graphql/mutations";
import { onCreateMessage } from "./graphql/subscriptions";

Amplify.configure(config);

const fetchMessagesRequest = () => {
  const vars: MessagesByDateQueryVariables = {
    type: MessageType.MESSAGE,
    // Grab only 50 messages.
    limit: 50,
    // Sort them so we get the 50 latest message.
    sortDirection: ModelSortDirection.DESC,
  };

  const request = API.graphql(
    graphqlOperation(messagesByDate, vars)
  ) as Promise<GraphQLResult<MessagesByDateQuery>>;

  const result = request.then((result) => {
    console.log("fetched messages:", result.data);
    const messages = (result.data?.messagesByDate?.items ?? []).filter(
      <T extends any>(data: T | null): data is T => !!data
    );
    // The messages are now in the reverse order. Let's fix that!
    messages.reverse();
    return messages;
  });
  const cancel = () => API.cancel(request);

  return [result, cancel] as const;
};

const sendMessageRequest = async (input: CreateMessageInput) => {
  try {
    (await API.graphql(
      graphqlOperation(createMessage, { input })
    )) as GraphQLResult<CreateMessageMutation>;
    console.info("Sent message: ", input.message);
  } catch (error) {
    console.error("Send message error: ", error);
  }
};

function App() {
  const [messages, setMessages] = useState<Message[] | null>(null);

  const sendMessage = useCallback((message: string) => {
    sendMessageRequest({
      type: MessageType.MESSAGE,
      name: "Spammy bot",
      message,
    });
  }, []);

  useEffect(() => {
    const [result, cancel] = fetchMessagesRequest();
    result.then((data) => setMessages(data)).catch(() => setMessages([]));
    return () => {
      cancel();
    };
  }, []);

  useEffect(() => {
    // Subscribe to incoming messages.
    const subscription = (
      API.graphql(graphqlOperation(onCreateMessage)) as Observable<{
        value?: { data?: OnCreateMessageSubscription };
      }>
    ).subscribe({
      // We've received a new message!
      next: ({ value }) => {
        console.info("Received: ", value);
        // Get the message from the event.
        const message = value?.data?.onCreateMessage;
        // Just like when we fetch the full list, broken messages can be null.
        // Let's ignore those
        if (!message) return;
        setMessages((msgs) =>
          // Append the message to the list
          [...(msgs ?? []), message]
            // Only keep 50 messages. The 50 latest specifically
            .slice(-50)
        );
      },
    });

    // Unsubscribe when the component is unmounted
    return () => subscription.unsubscribe();
  }, []);

  return (
    <div className="App">
      Messages!
      {JSON.stringify(messages?.map(({ message }) => message))}
      <button onClick={() => sendMessage("my new message!")}>
        {" "}
        send message{" "}
      </button>
    </div>
  );
}

export default App;
