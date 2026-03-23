#include <node_api.h>
#include <string.h>

static napi_value hello(napi_env env, napi_callback_info info) {
    napi_value result;
    napi_create_string_utf8(env, "hello from napi", NAPI_AUTO_LENGTH, &result);
    return result;
}

static napi_value add(napi_env env, napi_callback_info info) {
    size_t argc = 2;
    napi_value argv[2];
    napi_get_cb_info(env, info, &argc, argv, NULL, NULL);

    double a, b;
    napi_get_value_double(env, argv[0], &a);
    napi_get_value_double(env, argv[1], &b);

    napi_value result;
    napi_create_double(env, a + b, &result);
    return result;
}

static napi_value init(napi_env env, napi_value exports) {
    napi_value hello_fn, add_fn;
    napi_create_function(env, "hello", NAPI_AUTO_LENGTH, hello, NULL, &hello_fn);
    napi_create_function(env, "add", NAPI_AUTO_LENGTH, add, NULL, &add_fn);

    napi_set_named_property(env, exports, "hello", hello_fn);
    napi_set_named_property(env, exports, "add", add_fn);

    return exports;
}

NAPI_MODULE_INIT() {
    return init(env, exports);
}
