use proc_macro::TokenStream;

/// No-op stand-in for `#[tauri::command]` so command bodies can be type checked.
#[proc_macro_attribute]
pub fn command(_attr: TokenStream, item: TokenStream) -> TokenStream {
    item
}
