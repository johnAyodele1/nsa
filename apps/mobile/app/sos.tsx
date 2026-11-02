import {useEffect,useState} from "react";
import {ActivityIndicator,Linking,Pressable,SafeAreaView,ScrollView,Share,StyleSheet,Text,View} from "react-native";
import * as Location from "expo-location";
import {emergencyContactListResponseSchema,nigerianStateSchema,type EmergencyContact,type NigerianState} from "@nsa/contracts";

const API=process.env.EXPO_PUBLIC_API_URL??"http://localhost:4000";
type CapturedLocation={latitude:number;longitude:number;accuracy:number|null;address:string|null;state:NigerianState|null};
export default function SosScreen(){
 const [contacts,setContacts]=useState<EmergencyContact[]>([]);
 const [location,setLocation]=useState<CapturedLocation|null>(null);
 const [loadingContacts,setLoadingContacts]=useState(true);
 const [locating,setLocating]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [callError,setCallError]=useState<string|null>(null);
 async function loadContacts(state?:NigerianState){
  setLoadingContacts(true);
  try{
   const query=state?"?state="+encodeURIComponent(state):"";
   const response=await fetch(API+"/v1/emergency-contacts"+query);
   if(!response.ok)throw new Error("Emergency contacts are temporarily unavailable.");
   const parsed=emergencyContactListResponseSchema.parse(await response.json());
   setContacts(parsed.data);
  }catch{setContacts([]);setError("Could not load verified emergency contacts. If you are in immediate danger, dial 112 directly.");}
  finally{setLoadingContacts(false);}
 }
 useEffect(()=>{void loadContacts();},[]);
 async function captureLocation(){
  setError(null);setCallError(null);setLocating(true);
  try{
   const permission=await Location.requestForegroundPermissionsAsync();
   if(permission.status!=="granted")throw new Error("Location permission was not granted. You can still call 112 and describe your location.");
   const position=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High,mayShowUserSettingsDialog:true});
   let address:string|null=null;let state:NigerianState|null=null;
   try{
    const places=await Location.reverseGeocodeAsync({latitude:position.coords.latitude,longitude:position.coords.longitude});
    const place=places[0];
    if(place){
     address=[place.name,place.street,place.district,place.city,place.region,place.country].filter((part,index,all)=>Boolean(part)&&all.indexOf(part)===index).join(", ");
     const region=place.region?.replace(/\s+State$/i,"").trim();
     const normalizedRegion=region==="Abuja"||region==="FCT"?"Federal Capital Territory":region;
     const parsedState=nigerianStateSchema.safeParse(normalizedRegion);
     if(parsedState.success)state=parsedState.data;
    }
   }catch{/* GPS coordinates remain useful when reverse geocoding is unavailable. */}
   setLocation({latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,address,state});
   await loadContacts(state??undefined);
  }catch(cause){setError(cause instanceof Error?cause.message:"Unable to determine your location. Call 112 and state your nearest landmark.");}
  finally{setLocating(false);}
 }
 const locationText=location?[
  "My current emergency location:",
  location.address??"Address unavailable",
  "Coordinates: "+location.latitude.toFixed(6)+", "+location.longitude.toFixed(6),
  "Map: https://www.google.com/maps?q="+location.latitude+","+location.longitude,
  location.accuracy?"GPS accuracy: approximately "+Math.round(location.accuracy)+" metres":null
 ].filter(Boolean).join("
"):"";
 async function call(number:string){
  setCallError(null);
  try{await Linking.openURL("tel:"+number);}
  catch{setCallError("Your device could not open the phone dialler. Dial 112 manually.");}
 }
 async function shareLocation(){
  if(!locationText)return;
  try{await Share.share({message:locationText,title:"My emergency location"});}
  catch{setError("Could not open the share sheet. Read the coordinates to the emergency operator.");}
 }
 const nationalContact=contacts.find(contact=>contact.phoneNumber==="112");
 const extraContacts=contacts.filter(contact=>contact.phoneNumber!=="112");
 return <SafeAreaView style={s.screen}><ScrollView contentContainerStyle={s.content}>
  <Text style={s.kicker}>EMERGENCY ASSISTANCE</Text>
  <Text style={s.title}>SOS</Text>
  <Text style={s.intro}>If someone is in immediate danger, call emergency services now. NSA is not a dispatch centre and cannot send responders.</Text>
  <View style={s.primary}><Text style={s.primaryTitle}>National emergency line</Text><Text style={s.number}>112</Text><Text style={s.body}>Police, ambulance, fire and other emergency response coordination across Nigeria.</Text><Pressable accessibilityRole="button" style={s.callButton} onPress={()=>void call(nationalContact?.phoneNumber??"112")}><Text style={s.callText}>CALL 112</Text></Pressable>{nationalContact&&<Text style={s.source}>Verified {new Date(nationalContact.verifiedAt).toLocaleDateString()} · <Text onPress={()=>void Linking.openURL(nationalContact.sourceUrl)}>official source</Text></Text>}</View>
  {loadingContacts&&<ActivityIndicator color="#b7f36b"/>}
  {!loadingContacts&&extraContacts.map(contact=><View key={contact.id} style={s.secondary}><Text style={s.secondaryTitle}>{contact.agencyName}</Text><Text style={s.numberSmall}>{contact.phoneNumber}</Text><Text style={s.body}>{contact.label} · {contact.scope}</Text><Pressable accessibilityRole="button" style={s.secondaryButton} onPress={()=>void call(contact.phoneNumber)}><Text style={s.secondaryButtonText}>CALL {contact.phoneNumber}</Text></Pressable><Text style={s.source}>Verified {new Date(contact.verifiedAt).toLocaleDateString()} · <Text onPress={()=>void Linking.openURL(contact.sourceUrl)}>official source</Text></Text></View>)}
  <View style={s.locationCard}><Text style={s.sectionTitle}>Your location</Text><Text style={s.body}>Capture your current GPS position and tell the operator the address or coordinates. Your precise coordinates stay on this screen; NSA does not send them to emergency services.</Text><Pressable accessibilityRole="button" disabled={locating} style={s.locationButton} onPress={()=>void captureLocation()}><Text style={s.locationButtonText}>{locating?"GETTING LOCATION…":location?"REFRESH MY LOCATION":"GET MY LOCATION"}</Text></Pressable>
   {location&&<><Text style={s.address}>{location.address??"Readable address unavailable"}</Text><Text selectable style={s.coordinates}>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</Text><Pressable accessibilityRole="button" style={s.secondaryButton} onPress={()=>void Linking.openURL("https://www.google.com/maps?q="+location.latitude+","+location.longitude)}><Text style={s.secondaryButtonText}>OPEN LOCATION IN MAPS</Text></Pressable><Pressable accessibilityRole="button" style={s.shareButton} onPress={()=>void shareLocation()}><Text style={s.shareText}>SHARE LOCATION</Text></Pressable></>}
  </View>
  {(error||callError)&&<Text accessibilityRole="alert" style={s.error}>{error??callError}</Text>}
  <Text style={s.warning}>Important: tapping Call opens your phone dialler. Confirm the call on your device. The emergency operator will not automatically receive your GPS location. Tell them your state, local government area, street and nearest landmark, then read out your coordinates if needed. If GPS fails, do not delay calling 112.</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#090e0d"},content:{padding:22,paddingBottom:48},kicker:{color:"#b7f36b",fontSize:10,letterSpacing:2,marginTop:24},title:{color:"#edf4ef",fontSize:52,fontWeight:"900",marginTop:8},intro:{color:"#c1cec7",fontSize:14,lineHeight:22,marginTop:8,marginBottom:22},primary:{backgroundColor:"#351515",borderWidth:1,borderColor:"#a83c3c",padding:20,marginBottom:14},primaryTitle:{color:"#fff",fontSize:16,fontWeight:"800"},number:{color:"#fff",fontSize:48,fontWeight:"900",marginTop:6},body:{color:"#c1cec7",fontSize:12,lineHeight:19,marginTop:8},callButton:{backgroundColor:"#d33d3d",padding:16,alignItems:"center",marginTop:18},callText:{color:"#fff",fontSize:14,fontWeight:"900",letterSpacing:1},secondary:{borderWidth:1,borderColor:"#33443c",padding:18,marginBottom:12},secondaryTitle:{color:"#edf4ef",fontSize:14,fontWeight:"800"},numberSmall:{color:"#b7f36b",fontSize:30,fontWeight:"900",marginTop:6},secondaryButton:{borderWidth:1,borderColor:"#b7f36b",padding:12,alignItems:"center",marginTop:12},secondaryButtonText:{color:"#b7f36b",fontSize:11,fontWeight:"800"},source:{color:"#91a39a",fontSize:10,marginTop:12},locationCard:{borderWidth:1,borderColor:"#435b4d",padding:18,marginTop:14},sectionTitle:{color:"#edf4ef",fontSize:20,fontWeight:"800"},locationButton:{backgroundColor:"#b7f36b",padding:14,alignItems:"center",marginTop:16},locationButtonText:{color:"#101710",fontSize:11,fontWeight:"900",letterSpacing:1},address:{color:"#edf4ef",fontSize:14,lineHeight:21,marginTop:16},coordinates:{color:"#b7f36b",fontSize:16,fontWeight:"800",marginTop:8},shareButton:{padding:12,alignItems:"center",marginTop:8,backgroundColor:"#1c3027"},shareText:{color:"#edf4ef",fontWeight:"800",fontSize:11},warning:{color:"#e7b2a0",fontSize:11,lineHeight:18,marginTop:24},error:{color:"#ffb5b5",fontSize:12,marginTop:16}});
