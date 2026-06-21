#include <cuda_runtime.h>
#include <device_launch_parameters.h>

__global__ void matrixMultiply(float *A, float *B, float *C, int numElements)
{
    // Block row and column
    int row = blockIdx.y * blockDim.y + threadIdx.y;
    int col = blockIdx.x * blockDim.x + threadIdx.x;

    if (row < numElements && col < numElements) {
        float sum = 0.0f;
        for (int i = 0; i < numElements; ++i) {
            sum += A[row * numElements + i] * B[i * numElements + col];
        }
        C[row * numElements + col] = sum;
    }
}

void launchKernel(float *A, float *B, float *C, int size) {
    dim3 threadsPerBlock(16, 16);
    dim3 numBlocks((size + threadsPerBlock.x - 1) / threadsPerBlock.x, 
                   (size + threadsPerBlock.y - 1) / threadsPerBlock.y);
                   
    matrixMultiply<<<numBlocks, threadsPerBlock>>>(A, B, C, size);
    cudaDeviceSynchronize();
}
