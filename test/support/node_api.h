#ifndef NODE_API_H
#define NODE_API_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

typedef struct NapiEnv* napi_env;
typedef struct napi_value__* napi_value;
typedef struct napi_ref__* napi_ref;
typedef struct napi_handle_scope__* napi_handle_scope;
typedef struct napi_callback_info__* napi_callback_info;
typedef struct napi_deferred__* napi_deferred;

typedef unsigned int napi_status;

#define napi_ok 0

typedef napi_value (*napi_callback)(napi_env env, napi_callback_info info);
typedef void (*napi_finalize)(napi_env env, void* finalize_data, void* finalize_hint);

#define NAPI_AUTO_LENGTH ((size_t)-1)

napi_status napi_create_string_utf8(napi_env env, const char* str, size_t length, napi_value* result);
napi_status napi_create_function(napi_env env, const char* utf8name, size_t length,
                                  napi_callback cb, void* data, napi_value* result);
napi_status napi_set_named_property(napi_env env, napi_value object,
                                     const char* utf8name, napi_value value);
napi_status napi_get_cb_info(napi_env env, napi_callback_info cbinfo,
                              size_t* argc, napi_value* argv,
                              napi_value* this_arg, void** data);
napi_status napi_get_value_double(napi_env env, napi_value value, double* result);
napi_status napi_create_double(napi_env env, double value, napi_value* result);

#ifdef __cplusplus
#define NAPI_MODULE_EXPORT extern "C" __attribute__((visibility("default")))
#else
#define NAPI_MODULE_EXPORT __attribute__((visibility("default")))
#endif

#define NAPI_MODULE_INIT()                                           \
    NAPI_MODULE_EXPORT napi_value                                    \
    napi_register_module_v1(napi_env env, napi_value exports)

#endif
