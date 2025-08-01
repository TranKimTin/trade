#include "common_type.h"
#include "sio_client.h"

using namespace std;

vector<shared_ptr<Bot>> getBotList(string botName, bool cachedTree);
void setBotList(string botName, bool cachedTree);
void sio_on_connected();
void sio_on_message(string const &event, sio::message::ptr const &data, bool isAck, sio::message::list &ack_resp);
void runApp();