import { configureStore } from "@reduxjs/toolkit";
import { combineReducers } from "redux";
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";

import stagesReducer from "./slices/stagesSlice";
import headersReducer from "./slices/headersSlice";
import settingsReducer from "./slices/settingsSlice";
import alertsReducer from "./slices/alertsSlice";
import monitoredHeadersReducer from "./slices/monitoredHeadersSlice";

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["monitoredHeaders"], // Only persist the monitored headers
};

const rootReducer = combineReducers({
  stages: stagesReducer,
  headers: headersReducer,
  settings: settingsReducer,
  alerts: alertsReducer,
  monitoredHeaders: monitoredHeadersReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export const persistor = persistStore(store);
export default store;
