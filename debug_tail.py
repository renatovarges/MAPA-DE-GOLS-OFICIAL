
try:
    with open('script.js', 'rb') as f:
        f.seek(0, 2) # end
        size = f.tell()
        f.seek(max(0, size - 2000))
        tail = f.read()
        
    print(f"Tail raw bytes (last 100): {tail[-100:]}")
    
    try:
        print(f"Tail decoded (utf-8): {tail.decode('utf-8', errors='replace')}")
    except:
        print("Tail decode failed")
        
except Exception as e:
    print(f"Error: {e}")
