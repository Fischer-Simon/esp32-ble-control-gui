#include <stdint.h>
#include <stdlib.h>

#include "heatshrink/heatshrink_encoder.h"

size_t* mallocSizePtr() {
    return malloc(sizeof(size_t));
}

uint32_t getSize(size_t* ptr) {
    return (uint32_t) *ptr;
}

uint32_t compress_data(uint8_t* data, uint32_t size, uint8_t* compressedData,
                        uint32_t compressedDataCapacity) {
    int ret = 0;

    heatshrink_encoder* encoder = heatshrink_encoder_alloc(11, 9);

    size_t compressedBytes = 0;
    int sinkedBytes = 0;
    while (sinkedBytes < size) {
        size_t inputBytes;
        if (heatshrink_encoder_sink(encoder, data + sinkedBytes, size - sinkedBytes, &inputBytes) != HSER_SINK_OK) {
            return -2;
        }
        sinkedBytes += inputBytes;

        size_t outBytes;
        if (heatshrink_encoder_poll(encoder, compressedData + compressedBytes, compressedDataCapacity - compressedBytes, &outBytes) != HSER_POLL_EMPTY) {
            return -3;
        }
        compressedBytes += outBytes;
    }

    heatshrink_encoder_finish(encoder);
    size_t outBytes;
    if (heatshrink_encoder_poll(encoder, compressedData + compressedBytes, compressedDataCapacity - compressedBytes, &outBytes) != HSER_POLL_EMPTY) {
        ret = -102;
    }
    compressedBytes += outBytes;

    heatshrink_encoder_free(encoder);
    return ret < 0 ? ret : compressedBytes;
}
