import { asyncHandler } from "../utlis/asyncHandler.js";
import { ApiError} from '../utlis/ApiError.js'
import { User } from "../models/User.model.js"
import { uploadOnCloudinary } from '../utlis/cloudinary.js'
import { ApiResponse } from '..//utlis/ApiResponse.js'
import jwt from "jsonwebtoken";



//Since the below method is common so we create a method for it and we are not using asyncHandler here as we are not require to handleany routes or complex handling. This is used for this file only.

const generateAccessAndRefreshTokens = async(userId)=> {
   try {

      const userToken = await User.findById(userId)

      const accessToken = userToken.generateAccessToken()
      const refreshToken = userToken.generateRefreshToken()

      userToken.refreshToken = refreshToken;
      await userToken.save({ validateBeforeSave: false })

      return {accessToken, refreshToken}
      
   } catch (error) {
      throw new ApiError(500, "Something went wrong while generating refresh and access token")
   }
}

const registerUser = asyncHandler (async(req, res)=> {
 
    //get user details from frontend (we can do that using postman also)
    //validation = not empty
    //check if user already exist (compare username and also email)
    //check for images, check for avatar (i.e. file handling)
    //upload them to cloudinary, avatar

    //create user object- create entry in db
    //remove password and refresh token filed from response
    //check for user creation
    //return response+



    //ret user details from frontend, req.body , req.query, req.params etc.

    const {fullName, email, username, password} = req.body
    console.log("email ", email);

     if ( [fullName, email, username, password].some((filed)=> filed?.trim === ""))  {
        throw new ApiError(400, "All fields are required")
     } 

     if(!email.includes('@')){
        throw new ApiError(400, "@ is required in mail field")
     }
 
    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
     })

     if(existedUser){
        throw new ApiError(409, "User with email or username already existed")
     }


     //     if(fullName=== ""){
//         throw ApiError(400, "fullname is required")


//     }


   //   console.log(req.files);

    const avatarLocalPath =  req.files?.avatar[0]?.path 
    // This gives us the path uploaded by multer. Multer uploads the file in the server and so after that we are able to access the path.

   //  const coverImageLocalPath = req.files?.coverImage[0]?.path; 

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length> 0) {
      coverImageLocalPath = req.files.coverImage[0].path //Now ths will not throw error. This is the classic way of checking.For avatar also we can check in this manner.

      //TypeError: Cannot read properties of undefined (reading '0')
    }

    //These path may or may not be there but avatar path path must be there. Multer has uploaded the path but we need to checkif it has reached our local server or not.

    if(!avatarLocalPath){
      throw new ApiError(400, "Avatar file is required")
    }


    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
   
    if(!avatar){
      throw new ApiError(400, "Avatar file is required")
    }

    //Since avatar is required filed so we check for it in every step i.e. while it is uploaded in the local server and also uploading it in the cloud


    const user = await User.create({
      fullName,
      avatar: avatar.url,
      coverImage: coverImage?.url || "",
      email,
      password,
      username: username.toLowerCase()
    })

  const createdUser = await User.findById(user._id).select(
   "-password -refreshToken"
  )

 if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user")
 }

 return res.status(201).json(
      new ApiResponse(200, createdUser, "User registered successfully")
 )

})

const loginUser = asyncHandler( async (req, res)=> {
//Enter email or username and check it if it is present in the database
//Check the password, use the compare method 
//access and refresh token
//send cookie
//If matches login the user

   const {username, email, password} = req.body;

   if(!(username || email)) {
      throw new ApiError(400, "Uername or email is required")
   }

   const user = await User.findOne({
      $or: [{email},{username}]
   })

   if(!user){
      throw new ApiError(404, "User doesn't exist")
   }

   //15:45, user and User use,  user is the instance of the user we created and recieve from the database. 

   const isPasswordValid = await user.isPasswordCorrect(password)

   if(!isPasswordValid){
      throw new ApiError(401, "Invalid user credentials")
   }

  const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

   //Here we have to decide if this an expensive operation. If not then call the database once again and if it is then update the previous user rather than calling the database

   const loggedInUser = await User.findById(user._id).select("-password -refreshToken") //optional step i.e. if the call is required and if not in industryy. Here we have called

   const options = { 
      httpOnly: true,
      secure: true,
   }

   return res
   .status(200)
   .cookie("accessToken", accessToken, options)
   .cookie("refreshToken", refreshToken, options)
   .json(
      new ApiResponse(
         200,
         {
            user: loggedInUser, accessToken, refreshToken
         },
         "User logged in successfully"
      )
   )

})

const logoutUser = asyncHandler(async(req, res, next)=> { 

   //Remove refersh token
   //Remove cookies, then only the user will be loggedout

    await User.findByIdAndUpdate(
      req.user._id,
      {
         $set: {
            refreshToken: undefined
         }
      },
      {
         new: true
      }
     )

     const options = { 
      httpOnly: true,
      secure: true,
   }

   return res.
   status(200)
   .clearCookie("accessToken", options)
   .clearCookie("refreshToken", options)
   .json(new ApiResponse(200, {}, "User loggedout successfully"))


})

const refreshAccessToken = asyncHandler(async(req,res)=> {

     const incomingRefreshToken = req.cookies.refreshAccessToken || req.body.refreshAccessToken

     if(!incomingRefreshToken) {
       throw new ApiError(401, "Unauthorized Request")
     }

     //From 14:50 below

    try {
       const decodedToken = jwt.verify(
        incomingRefreshToken,
        process.env.REFRESH_TOKEN_SECRET
       )
  
       const user = await User.findById(decodedToken?._id)
  
       if(!user) {
        throw new ApiError(401, "Invalid Refresh Token")
      }
  
      if(incomingRefreshToken !== user?.refreshToken){
        throw new ApiError(401, "Refresh token is expired or used")
      }
  
      const options = {
        httpOnly: true,
        secure: true
      }
  
     const {accessToken, newRefreshToken}  =await generateAccessAndRefreshTokens(user._id)
     return res
     .status(200)
     .cookie("accessToken", accessToken, options)
     .cookie("refreshToken", newRefreshToken, options)
     .json(
        new ApiResponse (
           200,
           {accessToken, refreshToken: newRefreshToken},
           "Access token refreshed"
        )
     )
    } catch (error) {
       throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

export {
   registerUser,
   loginUser,
   logoutUser,
   refreshAccessToken
}