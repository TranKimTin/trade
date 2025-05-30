#pragma once

#include "common_type.h"

class SocketBinance
{
protected:
    string broker;
    unordered_map<string, RateData> data; // key = symbol + "_" + timeframe;
    vector<string> timeframes;
    vector<string> symbolList;
    WebSocket ws;
    const int BATCH_SIZE;

    void on_message(connection_hdl, message_ptr msg);

    shared_ptr<boost::asio::ssl::context> on_tls_init(connection_hdl);
    void onSocketConnected(connection_hdl hdl);

    RateData getOHLCV(const string &symbol, const string &timeframe, int limit, long long since = 0);
    vector<string> getSymbolList();
    void connectSocket();
    void mergeData(string &symbol, string &timeframe, string &currentTF, double open, double high, double low, double close, double volume, long long timestamp, bool isFinal);
    void onCloseCandle(string &symbol, string &timeframe, RateData &data);
    void adjustData(RateData &rateData);

public:
    SocketBinance(const int _BATCH_SIZE);
};