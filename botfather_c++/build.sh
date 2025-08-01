set -e

SCRIPT_PATH="$0"
case "$SCRIPT_PATH" in
  /*) ;;
  *) SCRIPT_PATH="$(pwd)/$SCRIPT_PATH" ;;
esac

SCRIPT_DIR=$(dirname "$SCRIPT_PATH")
cd "$SCRIPT_DIR"

# rm -rf build
mkdir -p build

cmake -S ./ -B ./build -G Ninja -DCMAKE_BUILD_TYPE=Release -DLOG_FILE=ON
cmake --build ./build -- -j $(nproc)
