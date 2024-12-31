cmake_minimum_required(VERSION 3.25)

project(esp32-ble-control-gui)

set(SOURCES
        lib.c
        walloc.c
        bsdiff.c
        bsdiff_wasm.c
        heatshrink/heatshrink_encoder.c
        heatshrink/heatshrink_decoder.c
)

set(WASM_FUNCTIONS _heatshrink_decoder_alloc,_heatshrink_decoder_free,_heatshrink_decoder_sink,_heatshrink_decoder_poll,_heatshrink_decoder_finish,_malloc,_free,_mallocSizePtr,_getSize,_generate_patch,_compress_data)

add_custom_target(wasm-emscripten
        ALL
        COMMAND
        emcc --no-entry -s TOTAL_MEMORY=64mb -g -gsource-map -s EXPORTED_FUNCTIONS=${WASM_FUNCTIONS} -o "${CMAKE_SOURCE_DIR}/../public/lib.wasm" ${SOURCES}
        WORKING_DIRECTORY
        "${CMAKE_SOURCE_DIR}"
        SOURCES
        ${SOURCES}
)

add_library(wasm-lib lib.c heatshrink/heatshrink_decoder.c)
