#include <string.h>

#include "bsdiff.h"
#include "heatshrink/heatshrink_encoder.h"

void *malloc(size_t size);
void free(void *p);

typedef struct _MemBuf {
    uint8_t* buf;
    int seekPos;
    int size;
} MemBuf;

static int __write(MemBuf* memBuf, const void* buffer, int size) {
    if (memBuf->seekPos + size >= memBuf->size) {
        return -1;
    }
    memcpy(memBuf->buf + memBuf->seekPos, buffer, size);
    memBuf->seekPos += size;
    return 0;
}

typedef struct _BsdiffStream {
    heatshrink_encoder* encoder;
    size_t rawDiffSize;
    MemBuf target;
} BsdiffStream;

static int bsdiff_write(struct bsdiff_stream* stream, const void* buffer, int size) {
    BsdiffStream* opaque = stream->opaque;
    int sinkedBytes = 0;
    while (sinkedBytes < size) {
        size_t inputBytes;
        if (heatshrink_encoder_sink(opaque->encoder, (uint8_t*)buffer + sinkedBytes, size - sinkedBytes, &inputBytes) != HSER_SINK_OK) {
            return -2;
        }
        sinkedBytes += inputBytes;

        size_t outBytes;
        if (heatshrink_encoder_poll(opaque->encoder, opaque->target.buf + opaque->target.seekPos, opaque->target.size - opaque->target.seekPos, &outBytes) != HSER_POLL_EMPTY) {
            return -3;
        }
        opaque->target.seekPos += outBytes;
    }
    opaque->rawDiffSize += size;
    return 0;
}

uint32_t generate_patch(uint8_t* oldData, uint32_t oldSize, uint8_t* newData, uint32_t newSize, uint8_t* patchData,
                        uint32_t patchDataCapacity, size_t* rawDiffSize) {
    BsdiffStream opaque;
    opaque.encoder = heatshrink_encoder_alloc(11, 9);
    opaque.rawDiffSize = 0;
    opaque.target.buf = patchData;
    opaque.target.seekPos = 0;
    opaque.target.size = patchDataCapacity;

    struct bsdiff_stream* stream = malloc(sizeof(struct bsdiff_stream));
    stream->malloc = malloc;
    stream->free = free;
    stream->write = bsdiff_write;
    stream->opaque = &opaque;

    int ret = bsdiff(oldData, oldSize, newData, newSize, stream);
    if (ret < 0) {
        goto error;
    }

    heatshrink_encoder_finish(opaque.encoder);
    size_t outBytes;
    if (heatshrink_encoder_poll(opaque.encoder, opaque.target.buf + opaque.target.seekPos, opaque.target.size - opaque.target.seekPos, &outBytes) != HSER_POLL_EMPTY) {
        ret = -102;
        goto error;
    }
    opaque.target.seekPos += outBytes;
    *rawDiffSize = opaque.rawDiffSize;

error:
    free(stream);
    heatshrink_encoder_free(opaque.encoder);
    return ret < 0 ? ret : opaque.target.seekPos;
}
